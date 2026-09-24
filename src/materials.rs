use std::io::{Cursor, Read, Write};

use anyhow::{Context, Result, ensure};
use serde::Deserialize;
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

const CORE: &str = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
pub const MAX_MODEL_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Primary,
    Secondary,
}

impl Role {
    pub fn name(self) -> &'static str {
        match self {
            Self::Primary => "primary",
            Self::Secondary => "secondary",
        }
    }
}

pub fn declaration(log: &str) -> Result<Option<Vec<Role>>> {
    let mut declared = None;
    for line in log.lines() {
        if let Some(value) = line.strip_prefix("ECHO: scad_live_materials = ") {
            ensure!(
                declared.is_none(),
                "scad_live_materials must be declared exactly once"
            );
            let roles: Vec<Role> = serde_json::from_str(value)
                .context("scad_live_materials must be an array of primary/secondary role names")?;
            ensure!(
                !roles.is_empty() && roles.len() <= 2,
                "declare one or two material roles"
            );
            ensure!(
                roles.len() == 1 || roles[0] != roles[1],
                "duplicate material role"
            );
            declared = Some(roles);
        }
    }
    Ok(declared)
}

/// Read the plain, single mesh exported by OpenSCAD 2021.01. Do not silently
/// flatten a different 3MF structure or drop its transforms/properties.
pub fn mesh_xml(bytes: &[u8]) -> Result<String> {
    ensure!(
        bytes.len() as u64 <= MAX_MODEL_BYTES,
        "OpenSCAD 3MF exceeds 64 MiB"
    );
    let mut zip = ZipArchive::new(Cursor::new(bytes)).context("invalid OpenSCAD 3MF")?;
    let file = zip
        .by_name("3D/3dmodel.model")
        .context("3MF has no Core model")?;
    ensure!(file.size() <= MAX_MODEL_BYTES, "3MF model exceeds 64 MiB");
    let mut xml = String::new();
    file.take(MAX_MODEL_BYTES + 1).read_to_string(&mut xml)?;
    ensure!(
        xml.len() as u64 <= MAX_MODEL_BYTES,
        "3MF model exceeds 64 MiB"
    );
    let doc = roxmltree::Document::parse_with_options(
        &xml,
        roxmltree::ParsingOptions {
            nodes_limit: 2_000_000,
            ..Default::default()
        },
    )?;
    let root = doc.root_element();
    ensure!(
        root.has_tag_name((CORE, "model"))
            && root.attribute("unit").unwrap_or("millimeter") == "millimeter",
        "expected a millimeter Core model"
    );
    let objects: Vec<_> = root
        .descendants()
        .filter(|n| n.has_tag_name((CORE, "object")))
        .collect();
    let items: Vec<_> = root
        .descendants()
        .filter(|n| n.has_tag_name((CORE, "item")))
        .collect();
    ensure!(
        objects.len() == 1
            && items.len() == 1
            && objects[0].attribute("id").is_some()
            && items[0].attribute("objectid") == objects[0].attribute("id"),
        "expected one OpenSCAD mesh and build item"
    );
    for node in root.descendants().filter(|n| n.is_element()) {
        ensure!(
            node.attribute("transform").is_none()
                && node.attribute("pid").is_none()
                && node.attribute("pindex").is_none()
                && node.attribute("p1").is_none(),
            "unexpected OpenSCAD transform/material property"
        );
    }
    let mesh = objects[0]
        .children()
        .find(|n| n.has_tag_name((CORE, "mesh")))
        .context("empty OpenSCAD mesh")?;
    let vertices: Vec<_> = mesh
        .descendants()
        .filter(|n| n.has_tag_name((CORE, "vertex")))
        .collect();
    let triangles: Vec<_> = mesh
        .descendants()
        .filter(|n| n.has_tag_name((CORE, "triangle")))
        .collect();
    ensure!(
        !vertices.is_empty() && !triangles.is_empty(),
        "empty OpenSCAD mesh"
    );
    for vertex in &vertices {
        for axis in ["x", "y", "z"] {
            let value: f64 = vertex
                .attribute(axis)
                .context("missing vertex coordinate")?
                .parse()?;
            ensure!(value.is_finite(), "non-finite vertex coordinate");
        }
    }
    for triangle in triangles {
        for index in ["v1", "v2", "v3"] {
            let value: usize = triangle
                .attribute(index)
                .context("missing triangle index")?
                .parse()?;
            ensure!(value < vertices.len(), "triangle index outside vertices");
        }
    }
    Ok(xml[mesh.range()].to_owned())
}

/// Package role meshes without moving any vertex. Only mesh objects carry
/// material defaults; the assembly groups all roles into one printable item.
pub fn package(parts: &[(Role, String)]) -> Result<Vec<u8>> {
    ensure!(
        !parts.is_empty() && parts.len() <= 2,
        "expected one or two material meshes"
    );
    ensure!(
        parts.len() == 1 || parts[0].0 != parts[1].0,
        "duplicate material role"
    );
    let mut xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><model xmlns="{CORE}" unit="millimeter" xml:lang="en-US"><resources><basematerials id="1">"#
    );
    for (role, _) in parts {
        // Display colors are hints only; base.name is the material identity.
        let color = match role {
            Role::Primary => "#DBE955FF",
            Role::Secondary => "#75C8E8FF",
        };
        xml.push_str(&format!(
            r#"<base name="{}" displaycolor="{color}"/>"#,
            role.name()
        ));
    }
    xml.push_str("</basematerials>");
    for (index, (role, mesh)) in parts.iter().enumerate() {
        xml.push_str(&format!(
            r#"<object id="{}" type="model" name="{}" pid="1" pindex="{index}">{mesh}</object>"#,
            index + 2,
            role.name()
        ));
    }
    let assembly = parts.len() + 2;
    xml.push_str(&format!(
        r#"<object id="{assembly}" type="model"><components>"#
    ));
    for index in 0..parts.len() {
        xml.push_str(&format!(r#"<component objectid="{}"/>"#, index + 2));
    }
    xml.push_str(&format!(
        r#"</components></object></resources><build><item objectid="{assembly}"/></build></model>"#
    ));
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, content) in [
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>"#,
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>"#,
        ),
        ("3D/3dmodel.model", xml.as_str()),
    ] {
        zip.start_file(
            name,
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
        )?;
        zip.write_all(content.as_bytes())?;
    }
    Ok(zip.finish()?.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Read, Write};
    use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

    const MESH: &str = r#"<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="2"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh>"#;
    fn native(mesh: &str) -> Vec<u8> {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("3D/3dmodel.model", SimpleFileOptions::default())
            .unwrap();
        write!(zip, r#"<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter"><resources><object id="9" type="model">{mesh}</object></resources><build><item objectid="9"/></build></model>"#).unwrap();
        zip.finish().unwrap().into_inner()
    }
    #[test]
    fn declaration_is_explicit_unique_and_closed() {
        assert_eq!(declaration("ECHO: 42").unwrap(), None);
        assert_eq!(
            declaration("ECHO: scad_live_materials = [\"secondary\", \"primary\"]").unwrap(),
            Some(vec![Role::Secondary, Role::Primary])
        );
        for value in [
            "[]",
            "[\"primary\", \"primary\"]",
            "[\"Primary\"]",
            "[\"other\"]",
            "\"primary\"",
            "undef",
        ] {
            assert!(
                declaration(&format!("ECHO: scad_live_materials = {value}")).is_err(),
                "{value}"
            );
        }
        assert!(declaration("ECHO: scad_live_materials = [\"primary\"]\nECHO: scad_live_materials = [\"primary\"]").is_err());
    }
    #[test]
    fn mesh_preserves_coordinates_but_rejects_invalid_geometry() {
        assert_eq!(mesh_xml(&native(MESH)).unwrap(), MESH);
        for invalid in [
            MESH.replace("v3=\"2\"", "v3=\"3\""),
            MESH.replace("x=\"10\"", "x=\"NaN\""),
            MESH.replace("<triangle v1=\"0\" v2=\"1\" v3=\"2\"/>", ""),
            MESH.replace("v1=\"0\"", "pid=\"1\" v1=\"0\""),
        ] {
            assert!(mesh_xml(&native(&invalid)).is_err());
        }
        assert!(mesh_xml(b"not a zip").is_err());
    }
    #[test]
    fn package_has_named_roles_one_assembly_and_no_assembly_properties() {
        let bytes = package(&[
            (Role::Secondary, MESH.into()),
            (Role::Primary, MESH.replace("x=\"10\"", "x=\"20\"")),
        ])
        .unwrap();
        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut xml = String::new();
        archive
            .by_name("3D/3dmodel.model")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let bases: Vec<_> = doc
            .descendants()
            .filter(|n| n.has_tag_name("base"))
            .collect();
        let objects: Vec<_> = doc
            .descendants()
            .filter(|n| n.has_tag_name("object"))
            .collect();
        assert_eq!(
            bases
                .iter()
                .map(|n| n.attribute("name").unwrap())
                .collect::<Vec<_>>(),
            ["secondary", "primary"]
        );
        for (index, object) in objects[..2].iter().enumerate() {
            assert_eq!(
                object.attribute("pid"),
                bases[0].parent().unwrap().attribute("id")
            );
            assert_eq!(
                object
                    .attribute("pindex")
                    .unwrap()
                    .parse::<usize>()
                    .unwrap(),
                index
            );
        }
        assert!(objects[2].attribute("pid").is_none());
        assert_eq!(
            objects[2]
                .descendants()
                .filter(|n| n.has_tag_name("component"))
                .count(),
            2
        );
        let items: Vec<_> = doc
            .descendants()
            .filter(|n| n.has_tag_name("item"))
            .collect();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].attribute("objectid"), objects[2].attribute("id"));
        assert!(xml.contains("x=\"20\""));
        assert!(package(&[]).is_err());
        assert!(package(&[(Role::Primary, MESH.into()), (Role::Primary, MESH.into())]).is_err());
    }
}

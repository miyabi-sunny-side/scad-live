use scad_live::watch::render_one;
use std::io::{Cursor, Read};

fn model_xml(bytes: &[u8]) -> String {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut xml = String::new();
    archive
        .by_name("3D/3dmodel.model")
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    xml
}

#[tokio::test]
async fn actual_openscad_preserves_roles_coordinates_and_last_success() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("model.scad");
    let output = dir.path().join("model.3mf");
    std::fs::write(&source, "cube([10,20,30]);").unwrap();
    render_one(&source, &output).await.unwrap();
    let xml = model_xml(&std::fs::read(&output).unwrap());
    let doc = roxmltree::Document::parse(&xml).unwrap();
    let bases: Vec<_> = doc
        .descendants()
        .filter(|n| n.has_tag_name("base"))
        .collect();
    assert_eq!(bases.len(), 1);
    assert_eq!(bases[0].attribute("name"), Some("primary"));

    let valid = include_str!("fixtures/material-roles.scad");
    std::fs::write(&source, valid).unwrap();
    render_one(&source, &output).await.unwrap();
    let previous = std::fs::read(&output).unwrap();
    let xml = model_xml(&previous);
    let doc = roxmltree::Document::parse(&xml).unwrap();
    let bases: Vec<_> = doc
        .descendants()
        .filter(|n| n.has_tag_name("base"))
        .collect();
    for object in doc
        .descendants()
        .filter(|n| n.has_tag_name("object") && n.attribute("pid").is_some())
    {
        let index = object
            .attribute("pindex")
            .unwrap()
            .parse::<usize>()
            .unwrap();
        let role = bases[index].attribute("name").unwrap();
        let mut min = [f64::INFINITY; 3];
        let mut max = [f64::NEG_INFINITY; 3];
        for vertex in object.descendants().filter(|n| n.has_tag_name("vertex")) {
            for (axis, name) in ["x", "y", "z"].iter().enumerate() {
                let value = vertex.attribute(*name).unwrap().parse::<f64>().unwrap();
                min[axis] = min[axis].min(value);
                max[axis] = max[axis].max(value);
            }
        }
        assert_eq!(
            min,
            if role == "primary" {
                [0., 0., 0.]
            } else {
                [10., 0., 0.]
            }
        );
        assert_eq!(
            max,
            if role == "primary" {
                [10., 10., 2.]
            } else {
                [20., 10., 2.]
            }
        );
    }
    assert_eq!(bases.len(), 2);

    for invalid in [
        "this is not SCAD".to_owned(),
        valid.replace("[\"primary\", \"secondary\"]", "[\"primary\", \"primary\"]"),
        valid.replace("[\"primary\", \"secondary\"]", "[\"unknown\"]"),
        valid.replace("[\"primary\", \"secondary\"]", "[]"),
        format!("{valid}\necho(scad_live_materials=[\"primary\",\"secondary\"]);"),
        valid.replace("translate([10, 0, 0]) cube([10, 10, 2]);", "union() {}"),
        valid.replace(
            "echo(scad_live_materials",
            "if (scad_live_material == \"all\") echo(scad_live_materials",
        ),
        valid.replace(
            "translate([10, 0, 0]) cube([10, 10, 2]);",
            "assert(false, \"secondary failed\");",
        ),
    ] {
        std::fs::write(&source, invalid).unwrap();
        assert!(render_one(&source, &output).await.is_err());
        assert_eq!(std::fs::read(&output).unwrap(), previous);
        assert_eq!(
            std::fs::read_dir(dir.path().join(".scad-live-tmp"))
                .unwrap()
                .count(),
            0
        );
    }
}

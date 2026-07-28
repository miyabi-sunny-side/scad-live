use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use anyhow::{Context, Result, bail};
use notify::{
    EventKind, RecursiveMode,
    event::{AccessKind, AccessMode},
};
use notify_debouncer_full::{DebounceEventResult, new_debouncer};
use tokio::process::Command;
use walkdir::WalkDir;

const DEBOUNCE: Duration = Duration::from_millis(350);
const RENDER_TIMEOUT: Duration = Duration::from_secs(120);

pub async fn run(projects: PathBuf, modules: PathBuf, dist: PathBuf) -> Result<()> {
    std::fs::create_dir_all(&projects)?;
    std::fs::create_dir_all(&modules)?;
    std::fs::create_dir_all(&dist)?;
    let projects = canonical_root(&projects, "projects")?;
    let modules = canonical_root(&modules, "modules")?;
    let dist = canonical_root(&dist, "dist")?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let mut debouncer = new_debouncer(DEBOUNCE, None, move |result: DebounceEventResult| {
        let _ = tx.send(result);
    })?;
    debouncer.watch(&projects, RecursiveMode::Recursive)?;
    debouncer.watch(&modules, RecursiveMode::Recursive)?;

    eprintln!("watching {} and {}", projects.display(), modules.display());
    render_all(&projects, &dist).await;
    while let Some(result) = rx.recv().await {
        let events = match result {
            Ok(events) => events,
            Err(errors) => {
                for error in errors {
                    eprintln!("watch error: {error}");
                }
                continue;
            }
        };
        let module_changed = events.iter().any(|event| {
            is_source_mutation(&event.kind)
                && event
                    .paths
                    .iter()
                    .any(|path| path.starts_with(&modules) && is_scad(path))
        });
        if module_changed {
            render_all(&projects, &dist).await;
            continue;
        }
        let mut paths = BTreeMap::new();
        for event in events {
            if !is_source_mutation(&event.kind) {
                continue;
            }
            for path in &event.paths {
                if path.starts_with(&projects) && is_scad(path) {
                    let removed = matches!(event.kind, EventKind::Remove(_));
                    paths
                        .entry(path.clone())
                        .and_modify(|value| *value |= removed)
                        .or_insert(removed);
                }
            }
        }
        for (path, removed) in paths {
            let output = match output_path(&projects, &dist, &path) {
                Ok(path) => path,
                Err(error) => {
                    eprintln!("mapping {} failed: {error:#}", path.display());
                    continue;
                }
            };
            if removed || !path.exists() {
                if let Err(error) = std::fs::remove_file(&output)
                    && error.kind() != std::io::ErrorKind::NotFound
                {
                    eprintln!("remove {} failed: {error}", output.display());
                }
            } else if let Err(error) = render_one(&path, &output).await {
                eprintln!("render {} failed: {error:#}", path.display());
            }
        }
    }
    Ok(())
}

fn canonical_root(path: &Path, name: &str) -> Result<PathBuf> {
    std::fs::canonicalize(path).with_context(|| format!("could not resolve {name} directory"))
}

fn is_scad(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("scad"))
}

fn is_source_mutation(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_)
            | EventKind::Modify(_)
            | EventKind::Remove(_)
            | EventKind::Access(AccessKind::Close(AccessMode::Write))
    )
}

pub fn output_path(projects: &Path, dist: &Path, source: &Path) -> Result<PathBuf> {
    let relative = source
        .strip_prefix(projects)
        .context("source is outside projects directory")?;
    if relative
        .components()
        .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        bail!("source path is not a safe relative path");
    }
    Ok(dist.join(relative).with_extension("stl"))
}

async fn render_all(projects: &Path, dist: &Path) {
    let sources: Vec<_> = WalkDir::new(projects)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_scad(entry.path()))
        .map(walkdir::DirEntry::into_path)
        .collect();
    for source in sources {
        match output_path(projects, dist, &source) {
            Ok(output) => {
                if let Err(error) = render_one(&source, &output).await {
                    eprintln!("render {} failed: {error:#}", source.display());
                }
            }
            Err(error) => eprintln!("mapping {} failed: {error:#}", source.display()),
        }
    }
}

pub async fn render_one(source: &Path, output: &Path) -> Result<()> {
    let parent = output.parent().context("output has no parent")?;
    let temp_dir = parent.join(".scad-live-tmp");
    tokio::fs::create_dir_all(&temp_dir).await?;
    let name = output
        .file_name()
        .context("output has no filename")?
        .to_string_lossy();
    let temporary = temp_dir.join(format!(".{name}.{}.stl", std::process::id()));
    let mut child = Command::new("openscad")
        .arg("-o")
        .arg(&temporary)
        .arg(source)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .context("could not start openscad")?;
    let status = match tokio::time::timeout(RENDER_TIMEOUT, child.wait()).await {
        Ok(result) => result?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = tokio::fs::remove_file(&temporary).await;
            bail!(
                "openscad timed out after {} seconds",
                RENDER_TIMEOUT.as_secs()
            );
        }
    };
    if !status.success() {
        let _ = tokio::fs::remove_file(&temporary).await;
        bail!("openscad exited with {status}");
    }
    tokio::fs::create_dir_all(parent).await?;
    tokio::fs::rename(&temporary, output).await?;
    eprintln!("rendered {} -> {}", source.display(), output.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_nested_project_to_stl() {
        assert_eq!(
            output_path(
                Path::new("projects"),
                Path::new("dist"),
                Path::new("projects/a/b.scad")
            )
            .unwrap(),
            Path::new("dist/a/b.stl")
        );
        assert!(
            output_path(
                Path::new("projects"),
                Path::new("dist"),
                Path::new("elsewhere/a.scad")
            )
            .is_err()
        );
    }

    #[test]
    fn accepts_mutations_but_rejects_source_reads() {
        use notify::event::{CreateKind, DataChange, ModifyKind, RemoveKind};

        assert!(is_source_mutation(&EventKind::Create(CreateKind::File)));
        assert!(is_source_mutation(&EventKind::Modify(ModifyKind::Data(
            DataChange::Content
        ))));
        assert!(is_source_mutation(&EventKind::Remove(RemoveKind::File)));
        assert!(is_source_mutation(&EventKind::Access(AccessKind::Close(
            AccessMode::Write
        ))));
        assert!(!is_source_mutation(&EventKind::Access(AccessKind::Open(
            AccessMode::Read
        ))));
        assert!(!is_source_mutation(&EventKind::Access(AccessKind::Close(
            AccessMode::Read
        ))));
        assert!(!is_source_mutation(&EventKind::Access(AccessKind::Read)));
    }

    #[test]
    fn resolves_relative_roots_to_an_absolute_basis() {
        let root = canonical_root(Path::new("."), "test").unwrap();
        assert!(root.is_absolute());
        assert_eq!(
            root,
            std::env::current_dir().unwrap().canonicalize().unwrap()
        );
    }

    #[tokio::test]
    async fn failed_render_retains_existing_output() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("bad.scad");
        let output = directory.path().join("existing.stl");
        std::fs::write(&source, "this is not valid OpenSCAD").unwrap();
        std::fs::write(&output, "previous").unwrap();
        assert!(render_one(&source, &output).await.is_err());
        assert_eq!(std::fs::read_to_string(output).unwrap(), "previous");
    }
}

use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use anyhow::{Context, Result, bail};
use notify::{
    EventKind, RecursiveMode,
    event::{AccessKind, AccessMode},
};
use notify_debouncer_full::{DebounceEventResult, DebouncedEvent, new_debouncer};
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
        apply_batch(&events, &projects, &dist, |source, output| async move {
            render_one(&source, &output).await
        })
        .await;
    }
    Ok(())
}

/// debounce された 1 バッチを、変更のあった source ごとに処理する。
/// render は注入する — 本番は `render_one`、テストは stub。
async fn apply_batch<F, Fut>(events: &[DebouncedEvent], projects: &Path, dist: &Path, render: F)
where
    F: Fn(PathBuf, PathBuf) -> Fut,
    Fut: std::future::Future<Output = Result<()>>,
{
    let mut paths = BTreeSet::new();
    for event in events {
        if !is_source_mutation(&event.kind) {
            continue;
        }
        for path in &event.paths {
            if path.starts_with(projects) && is_scad(path) {
                paths.insert(path);
            }
        }
    }
    for path in paths {
        let output = match output_path(projects, dist, path) {
            Ok(path) => path,
            Err(error) => {
                eprintln!("mapping {} failed: {error:#}", path.display());
                continue;
            }
        };
        // notify は Remove と Create の順序を保証しないので、イベント種別ではなく
        // 処理する瞬間の source の実在で決める。
        if !path.exists() {
            match std::fs::remove_file(&output) {
                Ok(()) => eprintln!("removed {}", output.display()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => eprintln!("remove {} failed: {error}", output.display()),
            }
        } else if let Err(error) = render(path.clone(), output).await {
            eprintln!("render {} failed: {error:#}", path.display());
        }
    }
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
    Ok(dist.join(relative).with_extension("3mf"))
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
    let staging = parent.join(".scad-live-tmp");
    tokio::fs::create_dir_all(&staging).await?;
    let temporary = tempfile::tempdir_in(staging)?;
    let probe = temporary.path().join("declaration.echo");
    run_openscad(source, &probe, "all").await?;
    let echo = read_bounded(&probe, MAX_LOG_BYTES).await?;
    let echo = String::from_utf8(echo).context("OpenSCAD echo is not UTF-8")?;
    anyhow::ensure!(
        !echo.lines().any(|line| line.starts_with("ERROR:")),
        "OpenSCAD declaration failed: {echo}"
    );
    let declared = crate::materials::declaration(&echo)?;
    let roles = declared
        .clone()
        .unwrap_or_else(|| vec![crate::materials::Role::Primary]);
    let mut parts = Vec::new();
    for role in roles {
        let generated = temporary.path().join(format!("{}.3mf", role.name()));
        let selector = if declared.is_some() {
            role.name()
        } else {
            "all"
        };
        let log = run_openscad(source, &generated, selector)
            .await
            .with_context(|| format!("rendering {}", role.name()))?;
        anyhow::ensure!(
            crate::materials::declaration(&log)? == declared,
            "scad_live_materials changed while rendering {}",
            role.name()
        );
        let bytes = read_bounded(&generated, crate::materials::MAX_MODEL_BYTES).await?;
        let mesh = crate::materials::mesh_xml(&bytes)
            .with_context(|| format!("invalid {} mesh", role.name()))?;
        parts.push((role, mesh));
    }
    let completed = temporary.path().join("complete.3mf");
    tokio::fs::write(&completed, crate::materials::package(&parts)?).await?;
    tokio::fs::rename(completed, output).await?;
    eprintln!("rendered {} -> {}", source.display(), output.display());
    Ok(())
}

const MAX_LOG_BYTES: u64 = 1024 * 1024;

async fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>> {
    use tokio::io::AsyncReadExt;
    let file = tokio::fs::File::open(path)
        .await
        .with_context(|| format!("OpenSCAD produced no file: {}", path.display()))?;
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes).await?;
    anyhow::ensure!(
        bytes.len() as u64 <= limit,
        "OpenSCAD output exceeds {limit} bytes"
    );
    Ok(bytes)
}

async fn run_openscad(source: &Path, output: &Path, role: &str) -> Result<String> {
    use tokio::io::AsyncReadExt;
    let mut child = Command::new("openscad")
        .arg("-o")
        .arg(output)
        .arg("-D")
        .arg(format!("scad_live_material=\"{role}\""))
        .arg(source)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .context("could not start openscad")?;
    let stderr = child.stderr.take().context("openscad stderr unavailable")?;
    let read_log = async move {
        let mut log = Vec::new();
        stderr.take(MAX_LOG_BYTES + 1).read_to_end(&mut log).await?;
        Ok::<_, std::io::Error>(log)
    };
    let (status, log) = tokio::time::timeout(RENDER_TIMEOUT, async {
        tokio::try_join!(child.wait(), read_log)
    })
    .await
    .context("openscad timed out after 120 seconds")??;
    anyhow::ensure!(
        log.len() as u64 <= MAX_LOG_BYTES,
        "OpenSCAD log exceeds 1 MiB"
    );
    let log = String::from_utf8_lossy(&log).into_owned();
    anyhow::ensure!(
        status.success() && !log.lines().any(|line| line.starts_with("ERROR:")),
        "openscad failed ({status}): {log}"
    );
    eprint!("{log}");
    Ok(log)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_nested_project_to_3mf() {
        assert_eq!(
            output_path(
                Path::new("projects"),
                Path::new("dist"),
                Path::new("projects/a/b.scad")
            )
            .unwrap(),
            Path::new("dist/a/b.3mf")
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

    fn event(kind: EventKind, path: &Path) -> DebouncedEvent {
        DebouncedEvent::new(
            notify::Event::new(kind).add_path(path.to_path_buf()),
            std::time::Instant::now(),
        )
    }

    /// `sed -i` や atomic save は unlink + create で書くので、1 バッチに
    /// Remove と Create が同居する。出力を消さず作り直せなければならない。
    #[tokio::test]
    async fn recreated_source_in_one_batch_is_rendered_not_removed() {
        use notify::event::{CreateKind, RemoveKind};

        let directory = tempfile::tempdir().unwrap();
        let projects = directory.path().join("projects");
        let dist = directory.path().join("dist");
        let source = projects.join("a.scad");
        let second = projects.join("z.scad");
        let output = dist.join("a.3mf");
        std::fs::create_dir_all(&projects).unwrap();
        std::fs::create_dir_all(&dist).unwrap();
        std::fs::write(&source, "cube(2);").unwrap();
        std::fs::write(&second, "cube(3);").unwrap();
        std::fs::write(&output, "previous").unwrap();

        let events = [
            event(EventKind::Create(CreateKind::File), &second),
            event(EventKind::Remove(RemoveKind::File), &source),
            event(EventKind::Create(CreateKind::File), &source),
        ];
        let rendered = std::cell::RefCell::new(Vec::new());
        apply_batch(&events, &projects, &dist, |source, output| {
            let rendered = &rendered;
            async move {
                rendered.borrow_mut().push(source);
                std::fs::write(&output, "rebuilt").unwrap();
                Ok(())
            }
        })
        .await;

        assert_eq!(rendered.into_inner(), vec![source, second]);
        assert_eq!(std::fs::read_to_string(&output).unwrap(), "rebuilt");
        assert_eq!(
            std::fs::read_to_string(dist.join("z.3mf")).unwrap(),
            "rebuilt"
        );
    }

    #[tokio::test]
    async fn vanished_source_drops_its_output() {
        use notify::event::RemoveKind;

        let directory = tempfile::tempdir().unwrap();
        let projects = directory.path().join("projects");
        let dist = directory.path().join("dist");
        let source = projects.join("a.scad");
        let output = dist.join("a.3mf");
        std::fs::create_dir_all(&projects).unwrap();
        std::fs::create_dir_all(&dist).unwrap();
        std::fs::write(&output, "previous").unwrap();

        let events = [event(EventKind::Remove(RemoveKind::File), &source)];
        let rendered = std::cell::RefCell::new(Vec::new());
        apply_batch(&events, &projects, &dist, |source, _output| {
            let rendered = &rendered;
            async move {
                rendered.borrow_mut().push(source);
                Ok(())
            }
        })
        .await;

        assert!(rendered.into_inner().is_empty());
        assert!(!output.exists());
    }

    #[tokio::test]
    async fn failed_render_retains_existing_output() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("bad.scad");
        let output = directory.path().join("existing.3mf");
        std::fs::write(&source, "this is not valid OpenSCAD").unwrap();
        std::fs::write(&output, "previous").unwrap();
        assert!(render_one(&source, &output).await.is_err());
        assert_eq!(std::fs::read_to_string(output).unwrap(), "previous");
    }
}

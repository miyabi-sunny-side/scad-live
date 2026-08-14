use std::{
    collections::BTreeMap,
    convert::Infallible,
    net::{IpAddr, SocketAddr},
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use anyhow::Result;
use axum::{
    Router,
    body::Body,
    extract::{Path as AxumPath, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response, Sse, sse::Event},
    routing::get,
};
use futures_util::StreamExt;
use notify::{
    EventKind, RecursiveMode,
    event::{AccessKind, AccessMode},
};
use notify_debouncer_full::{
    DebounceEventResult, Debouncer, RecommendedCache, new_debouncer, notify::RecommendedWatcher,
};
use rust_embed::RustEmbed;
use serde::Serialize;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_util::io::ReaderStream;
use tower_http::set_header::SetResponseHeaderLayer;
use walkdir::WalkDir;

#[derive(RustEmbed)]
#[folder = "client/dist/"]
struct Assets;

#[derive(Clone)]
struct AppState {
    dist: Arc<PathBuf>,
    events: broadcast::Sender<ModelEvent>,
}

#[derive(Clone, Debug, Serialize)]
struct ModelEvent {
    kind: &'static str,
    path: String,
}

pub async fn run(dist: PathBuf, address: (IpAddr, u16)) -> Result<()> {
    std::fs::create_dir_all(&dist)?;
    let dist = std::fs::canonicalize(dist)?;
    let (events, _) = broadcast::channel(128);
    let _watcher = watch_dist(dist.clone(), events.clone())?;
    let app = app(dist, events);
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(address)).await?;
    eprintln!("viewer listening on http://{}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}

fn app(dist: PathBuf, events: broadcast::Sender<ModelEvent>) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/api/models", get(models))
        .route("/models/{*path}", get(model))
        .route("/events", get(sse))
        .route("/{*path}", get(frontend_asset))
        .with_state(AppState {
            dist: Arc::new(dist),
            events,
        })
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
}

async fn index() -> Response {
    asset("index.html")
}

async fn frontend_asset(AxumPath(path): AxumPath<String>) -> Response {
    let relative = path.trim_start_matches('/');
    match Assets::get(relative) {
        Some(_) => asset(relative),
        None if is_stl(Path::new(relative)) => asset("index.html"),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

fn asset(path: &str) -> Response {
    match Assets::get(path) {
        Some(file) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], file.data).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn models(State(state): State<AppState>) -> impl IntoResponse {
    axum::Json(list_models(&state.dist))
}

fn list_models(dist: &Path) -> Vec<String> {
    let mut models: Vec<_> = WalkDir::new(dist)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| entry.depth() == 0 || !is_hidden(entry.path(), dist))
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_stl(entry.path()))
        .filter_map(|entry| {
            entry
                .path()
                .strip_prefix(dist)
                .ok()
                .map(|path| path.to_string_lossy().replace('\\', "/"))
        })
        .collect();
    models.sort();
    models
}

fn is_hidden(path: &Path, root: &Path) -> bool {
    path.strip_prefix(root).ok().is_some_and(|relative| {
        relative
            .components()
            .any(|part| part.as_os_str().to_string_lossy().starts_with('.'))
    })
}

fn is_stl(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("stl"))
}

async fn model(State(state): State<AppState>, AxumPath(path): AxumPath<String>) -> Response {
    let relative = Path::new(path.trim_start_matches('/'));
    if path.starts_with('/')
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || is_hidden(relative, Path::new(""))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let requested = state.dist.join(relative);
    let canonical_root = match tokio::fs::canonicalize(&*state.dist).await {
        Ok(path) => path,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let canonical = match tokio::fs::canonicalize(&requested).await {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return StatusCode::NOT_FOUND.into_response();
        }
        Err(_) => return StatusCode::FORBIDDEN.into_response(),
    };
    if !canonical.starts_with(canonical_root) || !is_stl(&canonical) {
        return StatusCode::FORBIDDEN.into_response();
    }
    match tokio::fs::File::open(canonical).await {
        Ok(file) => (
            [(header::CONTENT_TYPE, "model/stl")],
            Body::from_stream(ReaderStream::new(file)),
        )
            .into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn sse(
    State(state): State<AppState>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(state.events.subscribe()).filter_map(|message| async move {
        match message {
            Ok(event) => Some(Ok(Event::default().json_data(event).unwrap())),
            Err(_) => None,
        }
    });
    Sse::new(stream)
        .keep_alive(axum::response::sse::KeepAlive::new().interval(Duration::from_secs(15)))
}

fn watch_dist(
    dist: PathBuf,
    sender: broadcast::Sender<ModelEvent>,
) -> notify::Result<Debouncer<RecommendedWatcher, RecommendedCache>> {
    let root = dist.clone();
    let mut watcher = new_debouncer(
        Duration::from_millis(300),
        None,
        move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let mut changes: BTreeMap<String, &'static str> = BTreeMap::new();
            for event in events {
                let Some(kind) = classify_event(&event.kind) else {
                    continue;
                };
                for path in &event.paths {
                    if !is_stl(path) || is_hidden(path, &root) {
                        continue;
                    }
                    if let Ok(relative) = path.strip_prefix(&root) {
                        let path = relative.to_string_lossy().replace('\\', "/");
                        changes
                            .entry(path)
                            .and_modify(|current| {
                                if event_priority(kind) > event_priority(current) {
                                    *current = kind;
                                }
                            })
                            .or_insert(kind);
                    }
                }
            }
            for (path, kind) in changes {
                let _ = sender.send(ModelEvent { kind, path });
            }
        },
    )?;
    watcher.watch(&dist, RecursiveMode::Recursive)?;
    Ok(watcher)
}

fn classify_event(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("add"),
        EventKind::Modify(_) | EventKind::Access(AccessKind::Close(AccessMode::Write)) => {
            Some("change")
        }
        EventKind::Remove(_) => Some("unlink"),
        _ => None,
    }
}

fn event_priority(kind: &str) -> u8 {
    match kind {
        "unlink" => 3,
        "add" => 2,
        _ => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::to_bytes, http::Request};
    use tower::ServiceExt;

    fn fixture() -> (tempfile::TempDir, Router) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("nested")).unwrap();
        std::fs::write(dir.path().join("z.stl"), "solid z").unwrap();
        std::fs::write(dir.path().join("nested/a.stl"), "solid a").unwrap();
        std::fs::write(dir.path().join("no.txt"), "no").unwrap();
        std::fs::create_dir(dir.path().join(".scad-live-tmp")).unwrap();
        std::fs::write(dir.path().join(".scad-live-tmp/x.stl"), "hidden").unwrap();
        let (tx, _) = broadcast::channel(8);
        let router = app(dir.path().to_path_buf(), tx);
        (dir, router)
    }

    async fn request(app: Router, uri: &str) -> Response {
        app.oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn api_is_sorted_and_hides_temporary_files() {
        let (_dir, app) = fixture();
        let response = request(app, "/api/models").await;
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(body, r#"["nested/a.stl","z.stl"]"#);
    }

    #[tokio::test]
    async fn model_security_and_content_type() {
        let (dir, app) = fixture();
        let response = request(app.clone(), "/models/nested/a.stl").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "model/stl");
        assert_eq!(
            to_bytes(response.into_body(), usize::MAX).await.unwrap(),
            "solid a"
        );
        assert_eq!(
            request(app.clone(), "/models/no.txt").await.status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            request(app.clone(), "/models/%2e%2e/no.txt").await.status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            request(app.clone(), "/models/missing.stl").await.status(),
            StatusCode::NOT_FOUND
        );
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/etc/passwd", dir.path().join("escape.stl")).unwrap();
            assert_eq!(
                request(app.clone(), "/models/escape.stl").await.status(),
                StatusCode::FORBIDDEN
            );
        }
    }

    #[tokio::test]
    async fn methods_assets_and_cache_policy() {
        let (_dir, app) = fixture();
        let post = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/models")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(post.status(), StatusCode::METHOD_NOT_ALLOWED);
        let embedded: Vec<_> = Assets::iter().map(|path| path.into_owned()).collect();
        assert!(embedded.iter().any(|path| path == "index.html"));
        assert!(
            embedded
                .iter()
                .any(|path| path.starts_with("static/") && path.ends_with(".js"))
        );
        assert!(
            embedded
                .iter()
                .any(|path| path.starts_with("static/") && path.ends_with(".css"))
        );
        for uri in std::iter::once("/".to_string()).chain(
            embedded
                .iter()
                .filter(|path| *path != "index.html")
                .map(|path| format!("/{path}")),
        ) {
            let response = request(app.clone(), &uri).await;
            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            let expected = if uri.ends_with(".js") {
                "text/javascript"
            } else if uri.ends_with(".css") {
                "text/css"
            } else if uri.ends_with(".svg") {
                "image/svg+xml"
            } else {
                "text/html"
            };
            assert_eq!(response.headers()[header::CONTENT_TYPE], expected, "{uri}");
        }

        let index = request(app.clone(), "/").await;
        let html = String::from_utf8(
            to_bytes(index.into_body(), usize::MAX)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap();
        let references: Vec<_> = html
            .split(['"', '\''])
            .filter(|part| part.starts_with('/') && *part != "/")
            .collect();
        assert!(!references.is_empty());
        for reference in references {
            assert_eq!(
                request(app.clone(), reference).await.status(),
                StatusCode::OK,
                "index reference {reference}"
            );
        }
        assert_eq!(
            request(app.clone(), "/static/does-not-exist.js")
                .await
                .status(),
            StatusCode::NOT_FOUND
        );

        let spa = request(app, "/nested/a.stl").await;
        assert_eq!(spa.status(), StatusCode::OK);
        assert_eq!(spa.headers()[header::CONTENT_TYPE], "text/html");
        let spa_html = String::from_utf8(
            to_bytes(spa.into_body(), usize::MAX)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap();
        assert_eq!(spa_html, html);
    }

    #[test]
    fn classifies_only_visible_stl_events() {
        let root = Path::new("dist");
        assert!(is_stl(Path::new("dist/a.STL")));
        assert!(!is_stl(Path::new("dist/a.txt")));
        assert!(is_hidden(Path::new("dist/.scad-live-tmp/a.stl"), root));
        assert!(!is_hidden(Path::new("dist/nested/a.stl"), root));
        assert_eq!(
            classify_event(&EventKind::Access(AccessKind::Close(AccessMode::Write))),
            Some("change")
        );
    }
}

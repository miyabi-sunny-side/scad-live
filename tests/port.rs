//! Verify the shipped process uses only PORT for its listener.
use std::{
    ffi::OsString,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    os::unix::ffi::OsStringExt,
    os::unix::fs::PermissionsExt,
    process::{Child, Command, Stdio},
    thread,
    time::Duration,
};

struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn command(base: &std::path::Path) -> Command {
    let bin = base.join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    let openscad = bin.join("openscad");
    std::fs::write(&openscad, "#!/bin/sh\nexit 0\n").unwrap();
    std::fs::set_permissions(&openscad, std::fs::Permissions::from_mode(0o755)).unwrap();
    let mut command = Command::new(env!("CARGO_BIN_EXE_scad-live"));
    command.arg(base).env("PATH", bin);
    command
}

#[test]
fn port_selects_the_api_listener_and_legacy_settings_are_ignored() {
    let base = tempfile::tempdir().unwrap();
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let mut process = Process(
        command(base.path())
            .env("PORT", port.to_string())
            .env("SCAD_LIVE_PORT", "bad")
            .env("SCAD_LIVE_BIND", "bad")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    let mut stream = (0..100)
        .find_map(|_| {
            assert!(process.0.try_wait().unwrap().is_none(), "server exited");
            match TcpStream::connect(("127.0.0.1", port)) {
                Ok(stream) => Some(stream),
                Err(_) => {
                    thread::sleep(Duration::from_millis(20));
                    None
                }
            }
        })
        .expect("server did not listen on PORT");
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(
        stream,
        "GET /api/models HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    assert!(response.starts_with("HTTP/1.1 200"), "{response}");
    assert!(response.ends_with("[]"), "{response}");
}

#[test]
fn invalid_port_fails_before_starting_the_server() {
    let base = tempfile::tempdir().unwrap();
    for port in ["", "0", "65536", "-1", "+8080", " 8080", "8080 ", "bad"]
        .into_iter()
        .map(OsString::from)
        .chain([OsString::from_vec(vec![0xff])])
    {
        let output = command(base.path())
            .env("PORT", &port)
            .env("SCAD_LIVE_PORT", "8080")
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(!output.status.success(), "PORT={port:?}");
        assert!(stderr.contains("PORT"), "{stderr}");
    }
}

use std::{net::IpAddr, path::PathBuf, process::Stdio};

use anyhow::{Context, Result, bail};
use clap::Parser;
use scad_live::config::{Config, resolve};

/// Watch a base camp of OpenSCAD sources and serve the rendered STL viewer.
#[derive(Parser)]
#[command(name = "scad-live", version)]
struct Cli {
    /// Base camp directory holding assets/, modules/ and dist/ (default: cwd)
    base: Option<PathBuf>,
    /// Optional YAML file overriding the assets/modules/dist directories
    #[arg(long)]
    config: Option<PathBuf>,
}

fn env_port() -> Result<u16> {
    match std::env::var("SCAD_LIVE_PORT") {
        Ok(value) => value
            .parse()
            .with_context(|| format!("SCAD_LIVE_PORT is not a valid port: {value}")),
        Err(_) => Ok(8080),
    }
}

fn env_bind() -> Result<IpAddr> {
    match std::env::var("SCAD_LIVE_BIND") {
        Ok(value) => value
            .parse()
            .with_context(|| format!("SCAD_LIVE_BIND is not a valid address: {value}")),
        Err(_) => Ok("0.0.0.0".parse().expect("static default address")),
    }
}

fn require_openscad() -> Result<()> {
    let found = std::process::Command::new("openscad")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok();
    if !found {
        bail!("openscad command not found in PATH");
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    require_openscad()?;

    let base = match cli.base {
        Some(base) => base,
        None => std::env::current_dir().context("could not determine current directory")?,
    };
    let config = match &cli.config {
        Some(path) => Config::load(path)?,
        None => Config::default(),
    };
    let paths = resolve(&base, &config);
    for directory in [&paths.assets, &paths.modules, &paths.dist] {
        std::fs::create_dir_all(directory)
            .with_context(|| format!("could not create {}", directory.display()))?;
    }
    let (bind, port) = (env_bind()?, env_port()?);
    eprintln!("base camp: {}", base.display());

    tokio::try_join!(
        scad_live::watch::run(paths.assets, paths.modules, paths.dist.clone()),
        scad_live::server::run(paths.dist, (bind, port)),
    )?;
    Ok(())
}

use std::{env, net::Ipv4Addr, num::NonZeroU16, path::PathBuf, process::Stdio};

use anyhow::{Context, Result, bail};
use clap::Parser;
use scad_live::config::{Config, resolve};

/// Watch a base camp of OpenSCAD sources and serve the rendered 3MF viewer.
#[derive(Parser)]
#[command(name = "scad-live", version)]
struct Cli {
    /// Base camp directory holding assets/, modules/ and dist/ (default: cwd)
    base: Option<PathBuf>,
    /// Optional YAML file overriding the assets/modules/dist directories
    #[arg(long)]
    config: Option<PathBuf>,
}

fn parse_port(value: Result<String, env::VarError>) -> Result<u16> {
    match value {
        Err(env::VarError::NotPresent) => Ok(8080),
        value => {
            let value = value.context("PORT must be a number from 1 to 65535")?;
            anyhow::ensure!(
                !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()),
                "PORT must be a number from 1 to 65535"
            );
            value
                .parse::<NonZeroU16>()
                .map(NonZeroU16::get)
                .context("PORT must be a number from 1 to 65535")
        }
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
    let port = parse_port(env::var("PORT"))?;
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
    eprintln!("base camp: {}", base.display());

    tokio::try_join!(
        scad_live::watch::run(paths.assets, paths.modules, paths.dist.clone()),
        scad_live::server::run(paths.dist, (Ipv4Addr::UNSPECIFIED.into(), port)),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_defaults_only_when_absent_and_accepts_the_full_range() {
        assert_eq!(parse_port(Err(env::VarError::NotPresent)).unwrap(), 8080);
        for port in [1, 8080, 65535] {
            assert_eq!(parse_port(Ok(port.to_string())).unwrap(), port);
        }
    }
}

use std::{net::IpAddr, path::PathBuf};

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "scad-live", about = "Live OpenSCAD renderer and STL viewer")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Watch OpenSCAD sources and render projects into dist.
    Watch {
        #[arg(long, default_value = "src/projects")]
        src: PathBuf,
        #[arg(long, default_value = "src/modules")]
        modules: PathBuf,
        #[arg(long, default_value = "dist")]
        dist: PathBuf,
    },
    /// Serve the viewer and STL files.
    Serve {
        #[arg(long, default_value = "dist")]
        dist: PathBuf,
        #[arg(long, default_value = "0.0.0.0")]
        bind: IpAddr,
        #[arg(long, default_value_t = 8080)]
        port: u16,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Watch { src, modules, dist } => scad_live::watch::run(src, modules, dist).await,
        Command::Serve { dist, bind, port } => scad_live::server::run(dist, (bind, port)).await,
    }
}

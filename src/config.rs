use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

/// Optional overrides loaded from `--config <file>`. Every key falls back to
/// the base-camp convention (`<base>/dist`, `<base>/assets`, `<base>/modules`).
#[derive(Debug, Default, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub dist: Option<PathBuf>,
    pub assets: Option<PathBuf>,
    pub modules: Option<PathBuf>,
}

/// The three directories scad-live operates on, after resolution.
#[derive(Debug, PartialEq)]
pub struct Paths {
    pub assets: PathBuf,
    pub modules: PathBuf,
    pub dist: PathBuf,
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path)
            .with_context(|| format!("could not read config file {}", path.display()))?;
        serde_norway::from_str(&text)
            .with_context(|| format!("could not parse config file {}", path.display()))
    }
}

pub fn resolve(base: &Path, config: &Config) -> Paths {
    let default = |name: &str| base.join(name);
    Paths {
        assets: config.assets.clone().unwrap_or_else(|| default("assets")),
        modules: config.modules.clone().unwrap_or_else(|| default("modules")),
        dist: config.dist.clone().unwrap_or_else(|| default("dist")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_base_camp_convention_without_config() {
        let paths = resolve(Path::new("/camp"), &Config::default());
        assert_eq!(paths.assets, PathBuf::from("/camp/assets"));
        assert_eq!(paths.modules, PathBuf::from("/camp/modules"));
        assert_eq!(paths.dist, PathBuf::from("/camp/dist"));
    }

    #[test]
    fn config_overrides_only_the_given_keys() {
        let config = Config {
            dist: Some(PathBuf::from("/elsewhere/out")),
            assets: None,
            modules: None,
        };
        let paths = resolve(Path::new("/camp"), &config);
        assert_eq!(paths.dist, PathBuf::from("/elsewhere/out"));
        assert_eq!(paths.assets, PathBuf::from("/camp/assets"));
        assert_eq!(paths.modules, PathBuf::from("/camp/modules"));
    }

    #[test]
    fn loads_partial_yaml() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("config.yaml");
        std::fs::write(&file, "assets: /cad/parts\n").unwrap();
        let config = Config::load(&file).unwrap();
        assert_eq!(config.assets, Some(PathBuf::from("/cad/parts")));
        assert_eq!(config.dist, None);
        assert_eq!(config.modules, None);
    }

    #[test]
    fn rejects_unknown_keys_and_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("config.yaml");
        std::fs::write(&file, "distt: /typo\n").unwrap();
        assert!(Config::load(&file).is_err());
        assert!(Config::load(&dir.path().join("absent.yaml")).is_err());
    }
}

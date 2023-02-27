use anyhow::{Context, Result};
use std::{
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
};

use tree_sitter::Language;

const BUILD_CMD: &str = "cargo rustc --crate-type=dylib --release";

pub enum SupportedLanguage {
    Rust,
}

impl SupportedLanguage {
    pub fn get_installer(&self) -> ParserInstaller {
        match self {
            Self::Rust => ParserInstaller {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-rust",
                symbol: b"language",
                name: "tree_sitter_rust",
            },
        }
    }
}

pub struct ParserInstaller {
    pub download_cmd: &'static str,
    pub symbol: &'static [u8],
    pub name: &'static str,
}

impl ParserInstaller {
    pub fn is_installed_at(&self, install_dir: &Path) -> bool {
        get_compiled_lib_path(self.name, install_dir).exists()
    }

    pub fn install_language(&self, install_dir: &Path) -> Result<Language> {
        download_parser(self.download_cmd, install_dir)
            .context("failed to download test parser")?;

        disable_language_fn_mangle(install_dir).context("failed to disable language fn mangle")?;

        build_parser(install_dir).context("failed to build test parser")?;

        dbg!(
            std::fs::read_dir(install_dir.join("target").join("release"))
                .unwrap()
                .collect::<Vec<_>>()
        );

        dbg!(std::str::from_utf8(
            &std::fs::read(install_dir.join("bindings").join("rust").join("lib.rs")).unwrap()
        )
        .unwrap());

        self.load_language(install_dir)
            .context("failed to load dynamic test parser")
    }

    pub fn load_language(&self, install_dir: &Path) -> Result<Language> {
        let lib_path = get_compiled_lib_path(self.name, install_dir);

        dbg!(&lib_path);

        unsafe {
            let lib = libloading::Library::new(lib_path)?;
            dbg!(&lib);
            let func: libloading::Symbol<unsafe extern "C" fn() -> Language> =
                lib.get(self.symbol)?;

            dbg!(&func);

            Ok(func())
        }
    }
}

fn download_parser(download_cmd: &str, target_dir: &Path) -> Result<ExitStatus> {
    let cmd = download_cmd
        .split_ascii_whitespace()
        .next()
        .context("got empty download command")?;
    let args: Vec<_> = download_cmd.split_ascii_whitespace().skip(1).collect();

    // download parser
    Command::new(cmd)
        .args(args)
        .arg(target_dir)
        .spawn()
        .context("failed to download parser")?
        .wait()
        .context("failed to run download cmd")
}

fn disable_language_fn_mangle(parser_dir: &Path) -> Result<()> {
    let lib_file = parser_dir.join("bindings").join("rust").join("lib.rs");
    let lib_file_buf = std::fs::read(&lib_file).context("failed to read lib.rs file")?;
    let lib_file_src =
        std::str::from_utf8(&lib_file_buf).context("failed to decode lib.rs content")?;

    let pattern = "pub fn language";
    let no_mangle_fn_locations = lib_file_src
        .match_indices(pattern)
        .map(|(byte, _)| byte)
        .collect::<Vec<_>>();

    let mut new_lib_file_src = lib_file_src.to_string();

    for loc in no_mangle_fn_locations.into_iter().rev() {
        new_lib_file_src.insert_str(loc, "#[no_mangle]\n")
    }

    std::fs::write(lib_file, new_lib_file_src).context("failed to write new lib file src")
}

fn build_parser(parser_dir: &Path) -> Result<ExitStatus> {
    let cmd = BUILD_CMD.split_ascii_whitespace().next().unwrap();
    let args: Vec<_> = BUILD_CMD.split_ascii_whitespace().skip(1).collect();

    Command::new(cmd)
        .args(args)
        .current_dir(parser_dir)
        .spawn()
        .context("failed to build parser")?
        .wait()
        .context("failed to run build cmd")
}

fn get_compiled_lib_path(name: &str, parser_dir: &Path) -> PathBuf {
    parser_dir.join("target").join("release").join(format!(
        "{}{}{}",
        std::env::consts::DLL_PREFIX,
        name,
        std::env::consts::DLL_SUFFIX
    ))
}

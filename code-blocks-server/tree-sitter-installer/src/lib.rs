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
    pub fn install_language(&self, install_dir: &Path) -> Result<Language> {
        download_parser(self.download_cmd, install_dir)
            .context("failed to download test parser")?;

        fixup_parser_rust_src(install_dir).context("failed to fixup test parser rust src")?;

        build_parser(install_dir).context("failed to build test parser")?;

        self.load_language(install_dir)
            .context("failed to load dynamic test parser")
    }

    pub fn load_language(&self, install_dir: &Path) -> Result<Language> {
        unsafe {
            let lib = libloading::Library::new(get_compiled_lib_path(self.name, install_dir))?;
            let func: libloading::Symbol<unsafe extern "C" fn() -> Language> =
                lib.get(self.symbol)?;
            Ok(func())
        }
    }
}

fn download_parser(download_cmd: &str, target_dir: &Path) -> Result<ExitStatus, std::io::Error> {
    let cmd = download_cmd.split_ascii_whitespace().next().unwrap();
    let args: Vec<_> = download_cmd.split_ascii_whitespace().skip(1).collect();

    // download parser
    Command::new(cmd)
        .args(args)
        .arg(target_dir)
        .spawn()
        .expect("failed to download parser")
        .wait()
}

fn fixup_parser_rust_src(parser_dir: &Path) -> Result<(), std::io::Error> {
    let lib_file = parser_dir.join("bindings").join("rust").join("lib.rs");
    let lib_file_buf = std::fs::read(&lib_file).expect("failed to read lib.rs file");
    let lib_file_src = std::str::from_utf8(&lib_file_buf).expect("failed to decode lib.rs content");

    let pattern = "pub fn language";
    let no_mangle_fn_locations = lib_file_src
        .match_indices(pattern)
        .map(|(byte, _)| byte)
        .collect::<Vec<_>>();

    let mut new_lib_file_src = lib_file_src.to_string();

    for loc in no_mangle_fn_locations.into_iter().rev() {
        new_lib_file_src.insert_str(loc, "#[no_mangle]\n")
    }

    std::fs::write(lib_file, new_lib_file_src)
}

fn build_parser(parser_dir: &Path) -> Result<ExitStatus, std::io::Error> {
    let cmd = BUILD_CMD.split_ascii_whitespace().next().unwrap();
    let args: Vec<_> = BUILD_CMD.split_ascii_whitespace().skip(1).collect();

    Command::new(cmd)
        .args(args)
        .current_dir(parser_dir)
        .spawn()
        .expect("failed to build parser")
        .wait()
}

fn get_compiled_lib_path(name: &str, parser_dir: &Path) -> PathBuf {
    parser_dir.join("target").join("release").join(format!(
        "{}{}{}",
        std::env::consts::DLL_PREFIX,
        name,
        std::env::consts::DLL_SUFFIX
    ))
}
use anyhow::{anyhow, Context, Result};
use std::{
    path::Path,
    process::{Command, ExitStatus},
};

use tree_sitter::Language;

pub const BUILD_CMD: &str = "cargo rustc --crate-type=dylib --release";

pub fn call_dynamic(dylib_path: &str) -> Result<Language, Box<dyn std::error::Error>> {
    unsafe {
        let lib = libloading::Library::new(dylib_path)?;
        let func: libloading::Symbol<unsafe extern "C" fn() -> Language> = lib.get(b"language")?;
        Ok(func())
    }
}

pub enum SupportedParser {
    Rust,
}

pub struct ParserInfo {
    pub download_cmd: &'static str,
    pub symbol: &'static [u8],
}

impl SupportedParser {
    pub fn get_parser_info(&self) -> ParserInfo {
        match self {
            Self::Rust => ParserInfo {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-rust",
                symbol: b"language",
            },
        }
    }
}

pub fn download_parser(info: &ParserInfo, target_dir: &Path) -> Result<ExitStatus, std::io::Error> {
    let cmd = info.download_cmd.split_ascii_whitespace().next().unwrap();
    let args: Vec<_> = info.download_cmd.split_ascii_whitespace().skip(1).collect();

    // download parser
    Command::new(cmd)
        .args(args)
        .arg(target_dir)
        .spawn()
        .expect("failed to download parser")
        .wait()
}

pub fn fixup_parser_rust_src(parser_dir: &Path) -> Result<(), std::io::Error> {
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

pub fn build_parser(parser_dir: &Path) -> Result<ExitStatus, std::io::Error> {
    let cmd = BUILD_CMD.split_ascii_whitespace().next().unwrap();
    let args: Vec<_> = BUILD_CMD.split_ascii_whitespace().skip(1).collect();

    Command::new(cmd)
        .args(args)
        .current_dir(parser_dir)
        .spawn()
        .expect("failed to build parser")
        .wait()
}

pub fn get_dynamic_language(
    dylib_path: &Path,
    symbol: &[u8],
) -> Result<Language, Box<dyn std::error::Error>> {
    unsafe {
        let lib = libloading::Library::new(dylib_path)?;
        let func: libloading::Symbol<unsafe extern "C" fn() -> Language> = lib.get(symbol)?;
        Ok(func())
    }
}

pub fn install_lang(info: &ParserInfo, parser_dir: &Path) -> Result<Language> {
    download_parser(info, parser_dir).context("failed to download test parser")?;

    fixup_parser_rust_src(parser_dir).context("failed to fixup test parser rust src")?;

    build_parser(parser_dir).context("failed to build test parser")?;

    let dylib_path = parser_dir
        .join("target")
        .join("release")
        .join("libtree_sitter_rust.dylib");

    // TODO: convert to properly use anyhow error handling
    let lang = get_dynamic_language(&dylib_path, info.symbol);
    if let Ok(lang) = lang {
        Ok(lang)
    } else {
        Err(anyhow!("failed to load dynamic test parser"))
    }
}

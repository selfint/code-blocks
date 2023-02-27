use tree_sitter_installer::*;

use tree_sitter::Parser;

const LOCAL_TREESITTER_RUST: ParserInfo = ParserInfo {
    download_cmd: "git clone ./tests/tree-sitter-rust",
    symbol: b"language",
};

#[test]
fn test_download_parser() {
    let target_dir = tempfile::tempdir()
        .expect("failed to get tempdir")
        .into_path()
        .join("test_download_parser")
        .join("test-parser");

    download_parser(&LOCAL_TREESITTER_RUST, &target_dir).expect("failed to download test parser");

    assert!(target_dir.exists());
}

#[test]
fn test_fixup_parser_rust_src() {
    let target_dir = tempfile::tempdir()
        .expect("failed to get tempdir")
        .into_path()
        .join("test_fixup_parser_rust_src")
        .join("test-parser");

    download_parser(&LOCAL_TREESITTER_RUST, &target_dir).expect("failed to download test parser");

    fixup_parser_rust_src(&target_dir).expect("failed to fixup parser rust src");

    let lib_file = target_dir.join("bindings").join("rust").join("lib.rs");
    let lib_file_buf = std::fs::read(lib_file).expect("failed to read lib.rs file");
    let lib_file_src = std::str::from_utf8(&lib_file_buf).expect("failed to decode lib.rs content");

    insta::assert_snapshot!(lib_file_src);
}

#[test]
fn test_build_parser() {
    let target_dir = tempfile::tempdir()
        .expect("failed to get tempdir")
        .into_path()
        .join("test_build_parser")
        .join("test-parser");

    fixup_parser_rust_src(&target_dir).expect("failed to fixup test parser rust src");

    build_parser(&target_dir).expect("failed to build test parser");

    let release_dir = target_dir.join("target").join("release");
    assert!(release_dir.exists());

    dbg!(std::fs::read_dir(&release_dir).unwrap().collect::<Vec<_>>());

    let expected_dylib_file_path = release_dir.join(format!(
        "{}tree_sitter_rust{}",
        std::env::consts::DLL_PREFIX,
        std::env::consts::DLL_SUFFIX
    ));

    dbg!(expected_dylib_file_path.to_str());

    assert!(expected_dylib_file_path.exists());
}

#[test]
fn test_get_dynamic_language() {
    let target_dir = tempfile::tempdir()
        .expect("failed to get tempdir")
        .into_path()
        .join("test_load_dynamic_parser")
        .join("test-parser");

    fixup_parser_rust_src(&target_dir).expect("failed to fixup test parser rust src");

    build_parser(&target_dir).expect("failed to build test parser");

    let release_dir = target_dir.join("target").join("release");
    assert!(release_dir.exists());

    dbg!(std::fs::read_dir(&release_dir).unwrap().collect::<Vec<_>>());

    let dylib_path = target_dir.join(format!(
        "{}tree_sitter_rust{}",
        std::env::consts::DLL_PREFIX,
        std::env::consts::DLL_SUFFIX
    ));

    let lang = get_dynamic_language(&dylib_path, LOCAL_TREESITTER_RUST.symbol)
        .expect("failed to load dynamic test parser");

    let src = "fn main() {}";

    let mut parser = Parser::new();
    parser.set_language(lang).unwrap();

    let tree = parser.parse(src, None);

    insta::assert_snapshot!(tree.unwrap().root_node().to_sexp(), @"(source_file (function_item name: (identifier) parameters: (parameters) body: (block)))");
}

#[test]
fn test_install_lang() {
    let target_dir = tempfile::tempdir()
        .expect("failed to get tempdir")
        .into_path()
        .join("test_install_lang")
        .join("test-parser");

    let lang = install_lang(&LOCAL_TREESITTER_RUST, &target_dir).expect("failed to install lang");

    let src = "fn main() {}";

    let mut parser = Parser::new();
    parser.set_language(lang).unwrap();

    let tree = parser.parse(src, None);

    insta::assert_snapshot!(tree.unwrap().root_node().to_sexp(), @"(source_file (function_item name: (identifier) parameters: (parameters) body: (block)))");
}

use tree_sitter_installer::*;

use tree_sitter::Parser;

const LOCAL_TREESITTER_RUST: ParserInfo = ParserInfo {
    download_cmd: "git clone ./tests/tree-sitter-rust",
    symbol: b"language",
    name: "tree_sitter_rust",
};

#[test]
fn test_install_lang() {
    let target_dir = tempfile::tempdir()
        .expect("failed to get tempdir")
        .into_path()
        .join("test_install_lang")
        .join("test-parser");

    let installed_lang =
        install_lang(&LOCAL_TREESITTER_RUST, &target_dir).expect("failed to install lang");

    let src = "fn main() {}";

    let mut parser = Parser::new();
    parser.set_language(installed_lang).unwrap();

    let tree = parser.parse(src, None);

    insta::assert_snapshot!(tree.unwrap().root_node().to_sexp(), @"(source_file (function_item name: (identifier) parameters: (parameters) body: (block)))");

    let loaded_lang = get_dynamic_language(&LOCAL_TREESITTER_RUST, &target_dir)
        .expect("failed to load dynamic language");

    parser.set_language(loaded_lang).unwrap();

    let tree = parser.parse(src, None);

    insta::assert_snapshot!(tree.unwrap().root_node().to_sexp(), @"(source_file (function_item name: (identifier) parameters: (parameters) body: (block)))");
}

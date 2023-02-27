use tree_sitter_installer::*;

const LOCAL_TREESITTER_RUST: ParserInstaller = ParserInstaller {
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

    let mut parser = LOCAL_TREESITTER_RUST
        .install_language(&target_dir)
        .expect("failed to install lang");

    let src = "fn main() {}";

    let tree = parser.parse(src, None);

    insta::assert_snapshot!(tree.unwrap().root_node().to_sexp(), @"(source_file (function_item name: (identifier) parameters: (parameters) body: (block)))");

    let mut parser = LOCAL_TREESITTER_RUST
        .load_language(&target_dir)
        .expect("failed to load dynamic language");

    let tree = parser.parse(src, None);

    insta::assert_snapshot!(tree.unwrap().root_node().to_sexp(), @"(source_file (function_item name: (identifier) parameters: (parameters) body: (block)))");
}

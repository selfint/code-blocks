use tree_sitter_installer::{
    parser_installer::{self, InstallationStatus},
    DynamicParser,
};

#[test]
fn test_install_and_load_parser() {
    let download_cmd = "git clone https://github.com/tree-sitter/tree-sitter-rust";
    let language_fn_symbol = b"language";
    let library_name = "tree_sitter_rust";
    let install_dir = tempfile::tempdir()
        .expect("failed to get tempdir")
        .path()
        .join("rust-parser");

    let mut did_download = false;
    let mut did_patching = false;
    let mut did_compiling = false;
    let report_progress = |status: InstallationStatus| match status {
        InstallationStatus::Downloading(_) => did_download = true,
        InstallationStatus::Patching => did_patching = true,
        InstallationStatus::Compiling(_) => did_compiling = true,
    };

    let library_path = parser_installer::install_parser(
        download_cmd,
        library_name,
        &install_dir,
        Some(report_progress),
    )
    .expect("failed to install rust parser");

    let mut parser = DynamicParser::load_from(&library_path, language_fn_symbol)
        .expect("failed to install rust parser");

    let src = "fn main() {}";

    let tree = parser.parse(src, None);

    insta::assert_snapshot!(tree.unwrap().root_node().to_sexp(),
        @"(source_file (function_item name: (identifier) parameters: (parameters) body: (block)))"
    );

    assert!(did_download);
    assert!(did_compiling);
    assert!(did_patching);
}

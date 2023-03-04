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

    let mut reported_progresses = vec![];
    let report_progress = |status: InstallationStatus| match status {
        InstallationStatus::Downloading(_) => reported_progresses.push("Downloading"),
        InstallationStatus::Patching => reported_progresses.push("Patching"),
        InstallationStatus::Compiling(_) => reported_progresses.push("Compiling"),
    };

    let library_path = parser_installer::install_parser(
        download_cmd,
        library_name,
        &install_dir,
        Some(report_progress),
    )
    .expect("failed to install rust parser");

    reported_progresses.sort();

    let mut parser = DynamicParser::load_from(&library_path, language_fn_symbol)
        .expect("failed to install rust parser");

    let src = "fn main() {}";

    let tree = parser.parse(src, None);

    insta::assert_snapshot!(tree.unwrap().root_node().to_sexp(),
        @"(source_file (function_item name: (identifier) parameters: (parameters) body: (block)))"
    );

    insta::assert_debug_snapshot!(reported_progresses,
        @r###"
    [
        "Compiling",
        "Compiling",
        "Compiling",
        "Compiling",
        "Compiling",
        "Compiling",
        "Compiling",
        "Compiling",
        "Compiling",
        "Compiling",
        "Downloading",
        "Downloading",
        "Downloading",
        "Downloading",
        "Patching",
    ]
    "###
    )
}

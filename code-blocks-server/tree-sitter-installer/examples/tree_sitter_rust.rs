use tree_sitter_installer::parser_installer;
use tree_sitter_installer::DynamicParser;

fn main() {
    let download_cmd = "git clone https://github.com/tree-sitter/tree-sitter-rust";
    let language_fn_symbol = b"language";
    let library_name = "tree_sitter_rust";
    let install_dir = tempfile::tempdir()
        .expect("failed to get tempdir")
        .path()
        .join("rust-parser");

    let library_path = parser_installer::install_parser(download_cmd, library_name, &install_dir)
        .expect("failed to install rust parser");

    let mut parser = DynamicParser::load_from(&library_path, language_fn_symbol)
        .expect("failed to install rust parser");

    let text = r#"
struct A {
    a: i32
}

fn main() {}
"#;

    let tree = parser.parse(text, None).expect("failed to parse text");

    println!("{}", tree.root_node().to_sexp());
}

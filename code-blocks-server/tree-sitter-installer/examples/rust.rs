use tree_sitter_installer::SupportedParser;

fn main() {
    let text = r#"
struct A {
    a: i32
}

fn main() {}
"#;

    let installer = SupportedParser::Rust.get_installer();
    let mut parser = installer
        .install_parser(
            &tempfile::tempdir()
                .expect("failed to get tempdir")
                .path()
                .join("rust-parser"),
        )
        .expect("failed to install rust parser");

    let tree = parser.parse(text, None).expect("failed to parse text");

    println!("{}", tree.root_node().to_sexp());
}

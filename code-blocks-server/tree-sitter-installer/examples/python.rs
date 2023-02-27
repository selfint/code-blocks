use tree_sitter_installer::SupportedParser;

fn main() {
    let text = r#"
class A:
    a: int

def main():
    pass

if __name__ == "__main__":
    main()
"#;

    let installer = SupportedParser::Python.get_installer();
    let mut parser = installer
        .install_parser(
            &tempfile::tempdir()
                .expect("failed to get tempdir")
                .path()
                .join("python-parser"),
        )
        .expect("failed to install python parser");

    let tree = parser.parse(text, None).expect("failed to parse text");

    println!("{}", tree.root_node().to_sexp());
}

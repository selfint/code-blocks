use tree_sitter_installer::SupportedParser;

fn main() {
    let text = r#"
class A {
    private a: number = 1;
}

function main() {
    let a = new A();
}
"#;

    let installer = SupportedParser::TypeScript.get_installer();
    let mut parser = installer
        .install_parser(
            &tempfile::tempdir()
                .expect("failed to get tempdir")
                .path()
                .join("typescript-parser"),
        )
        .expect("failed to install typescript parser");

    let tree = parser.parse(text, None).expect("failed to parse text");

    println!("{}", tree.root_node().to_sexp());
}

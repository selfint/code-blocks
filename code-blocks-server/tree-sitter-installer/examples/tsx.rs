use tree_sitter_installer::SupportedParser;

fn main() {
    let text = r#"
function App() {
  return (
    <div className="App">
        <h1>Hello, World!</h1>
    </div>
  );
}
"#;

    let installer = SupportedParser::TSX.get_installer();
    let mut parser = installer
        .install_parser(
            &tempfile::tempdir()
                .expect("failed to get tempdir")
                .path()
                .join("tsx-parser"),
        )
        .expect("failed to install tsx parser");

    let tree = parser.parse(text, None).expect("failed to parse text");

    println!("{}", tree.root_node().to_sexp());
}

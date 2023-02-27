use tree_sitter_installer::SupportedParser;

fn main() {
    let text = r#"
<script>
	let name = 'world';
</script>

<h1>Hello {name}!</h1>
"#;

    let installer = SupportedParser::Svelte.get_installer();
    let mut parser = installer
        .install_parser(
            &tempfile::tempdir()
                .expect("failed to get tempdir")
                .path()
                .join("svelte-parser"),
        )
        .expect("failed to install svelte parser");

    let tree = parser.parse(text, None).expect("failed to parse text");

    println!("{}", tree.root_node().to_sexp());
}

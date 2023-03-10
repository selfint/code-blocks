# tree-sitter-installer

Library for downloading, compiling and loading a tree-sitter parser at runtime.

## Example

```rs
use tree_sitter_installer::ParserInstaller;

fn main() {
    let text = r#"
struct A {
    a: i32
}

fn main() {}
"#;

    let installer = ParserInstaller {
        download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-rust",
        symbol: b"language",
        name: "tree_sitter_rust",
    };

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
    // prints: (source_file (struct_item name: (type_identifier) body: (field_declaration_list (field_declaration name: (field_identifier) type: (primitive_type)))) (function_item name: (identifier) parameters: (parameters) body: (block)))
}
```
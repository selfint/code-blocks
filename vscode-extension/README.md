# Code Blocks

Move your code blocks around!

This extension allows you to move your code as blocks, **_in any language_\***.

## Installation

![installation video](./assets/Code-Blocks-Installation-Demo.gif)

1. Download the .vsix file from the latest Release, and install it in Visual Studio Code.

2. After opening a file with the Code Blocks Editor, the `code-blocks-cli` will need to be downloaded
   by the method of your choosing (using `cargo` or downloading from the latest release).

3. Then the tree sitter grammar will be downloaded and compiled automatically.

That's it!

The next time you open a file in the same language, everything will already be setup.

## Examples

### TypeScript + JSX

![example](./assets/Code-Blocks-Demo-9.gif)

### Svelte

![example](./assets/Code-Blocks-Demo-10.gif)

### Rust

#### Code blocks moving function attributes and documentation

![example](./assets/Code-Blocks-Demo-8.gif)

#### Code blocks not moving blocks between scopes

![example](./assets/Code-Blocks-Demo-7.gif)

### Python

![example](./assets/Code-Blocks-Demo-11.gif)

## \*Supported languages

To support a language, [tree-sitter query](https://tree-sitter.github.io/tree-sitter/using-parsers#query-syntax)s are required to resolve blocks. This involves some manual
labour for each language, but not much.

Also, to use a language, a [tree-sitter grammar](https://tree-sitter.github.io/tree-sitter/creating-parsers#the-grammar-dsl) is required. There are [many grammars](https://github.com/tree-sitter) already written, but to use them they need to be compiled. The extension will
automatically download and compile the grammar for you, but it needs to know some metadata
about each grammar.

For now, these are the default configured languages:

- [x] Rust
- [x] TypeScript
- [x] TypeScript + JSX (typescriptreact)
- [x] Svelte
- [x] Python

Next up:

- [ ] Java
- [ ] C#
- [ ] C
- [ ] C++
- [ ] JavaScript

### Adding a language

To add support for a language yourself, you'll need to:

1. Configure the installation method of the grammar.

2. Write the tree sitter queries for creating the blocks.

Here is an example of the configuration for Python:

```json
"codeBlocks.languageSupport": {
    "python": {
        "parserInstaller": {
            "downloadCmd": "git clone https://github.com/tree-sitter/tree-sitter-python",
            "symbol": "language",
            "name": "tree_sitter_python"
        },
        "queries": [
            "(class_definition) @item",
            "(function_definition) @item",
            "(decorated_definition) @item"
        ]
    }
}
```

For figuring out how to write the queries, use the
[Tree-sitter playground](https://tree-sitter.github.io/tree-sitter/playground).

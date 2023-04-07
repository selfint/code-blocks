# Code Blocks

Move your code blocks around!

This extension allows you to move your code as blocks, **_in any language_\***.

Rust (technically just `cargo`) is required for this extension to work, go to [rust-lang.org](https://www.rust-lang.org/) to install it.

# Installation

1. Install the extension from:

   - Inside vscode, search for the `selfint.code-blocks` extension.
   - The [vscode marketplace](https://marketplace.visualstudio.com/items?itemName=selfint.code-blocks).
   - The GitHub [releases](https://github.com/selfint/code-blocks/releases?q=vscode-extension&expanded=true) page.

2. Open a file with the Code Blocks Editor, the `code-blocks-cli` will need to be downloaded
   by the method of your choosing (using `cargo` or downloading from the latest release).

3. Then the tree sitter grammar will be downloaded and compiled automatically.

That's it!

The next time you open a file in the same language, everything will already be setup.

If you open a file in a new language, the appropriate tree sitter grammar will be downloaded and compiled again.

## Installation from GitHub release demo

![installation video](./assets/Code-Blocks-Installation-Demo.gif)

# Usage

The purpose of this extension is to allow for fast and correct manipulation
and navigation of the syntax tree of the current file's code.

It does this by parsing the source code using [tree-sitter](https://tree-sitter.github.io/tree-sitter/)
to get the syntax tree of the file. It then runs [tree-sitter queries](https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries)
on that tree, to create a simpler tree containing the desired _blocks_. A
_block_ can be whatever you want, for example, this is a query for a function
block in python: `(function_definition) @item`. After the blocks are resolved,
they are made available for manipulation and navigation in two "modes",
the "block" mode, and the "editor" mode.

The "block" mode is the preferred and simpler variant, with the "editor" mode
allowing for more niche use cases.

## Block mode

To enter "block" mode, use the `codeBlocks.toggle` command, and again to exit.

In "block" mode, the block containing the current cursor position is highlighted,
and optionally the next and previous blocks as well. To navigate between the blocks,
use the `codeBlocks.navigateUp` / `codeBlocks.navigateDown` commands, to move the
current block, use the `codeBlocks.moveUp` / `codeBlocks.moveDown` commands. In some
cases the previous/next block's color will change, and the navigate/move command will
not work. This is because Code Blocks won't move a block outside it's parent scope,
unless you "force" it to. To perform a "force" move/navigate command, use their force
variant: `codeBlocks.navigateUpForce` / `codeBlocks.moveUpForce`.

To select the current block, use the `codeBlocks.selectBlock` command.

### Example

![svelte-1](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20svelte%201.gif)

More examples below.

### Tl;dr

| Command                                                       | Usage                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `codeBlocks.toggle`                                           | Toggle "block mode" on / off                                                         |
| `codeBlocks.moveUp` / `codeBlocks.moveDown`                   | Move the current block up / down                                                     |
| `codeBlocks.moveUpForce` / `codeBlocks.moveDownForce`         | Move the current block up / down, even if doing so escapes the current block's scope |
| `codeBlocks.navigateUp` / `codeBlocks.navigateDown`           | Jump to the previous / next block                                                    |
| `codeBlocks.navigateUpForce` / `codeBlocks.navigateDownForce` | Jump to the previous / next, even if doing so escapes the current block's scope      |
| `codeBlocks.selectBlock`                                      | Select the current block                                                             |

### Keybindings

These are the default key bindings, they are only active when "block mode" is on:

| Command                        | Keybinding (cmd on mac) |
| ------------------------------ | ----------------------- |
| `codeBlocks.moveUp`            | `alt+up`                |
| `codeBlocks.moveDown`          | `alt+down`              |
| `codeBlocks.moveUpForce`       | `alt+shift+up`          |
| `codeBlocks.moveDownForce`     | `alt+shift+down`        |
| `codeBlocks.navigateUp`        | `ctrl/cmd+up`           |
| `codeBlocks.navigateDown`      | `ctrl/cmd+down`         |
| `codeBlocks.navigateUpForce`   | `ctrl/cmd+shift+up`     |
| `codeBlocks.navigateDownForce` | `ctrl/cmd+shift+down`   |
| `codeBlocks.toggle`            | No default keybinding   |
| `codeBlocks.selectBlock`       | No default keybinding   |
| `codeBlocks.open`              | No default keybinding   |
| `codeBlocks.openToTheSide`     | No default keybinding   |

## Editor mode

To enter "editor" mode, use the `codeBlocks.open` or `codeBlocks.openToTheSide` commands.

To exit, either use the `workbench.action.reopenWithEditor` and open with the Text Editor, or
simply close the Code Blocks Editor tab.

In "editor" mode, all the blocks in the current file are visible. To move a block,
click it, then click on another block. The first block will be moved to be below
the second block. Clicking the same block twice will de-select the block.

In contrast to "block" mode, this allows you to move any block in the file to anywhere else
in the file, in one command.

Note that the same "force" semantics are enforced, you can't move a block to a different scope.
If you try, you'll receive a warning and a "Try force" notification, which will allow you
to perform the move operation.

## Examples - Block mode

In this mode, the current, previous, and next blocks are highlighted inside the editor.
Then, by running the "Move block up/down" commands, the current block is moved in the
appropriate direction.

### Rust

> Moving method in and around `impl` block

![rust-2](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20rust%202.gif)

> Moving `match` arms

![rust-1](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20rust%201.gif)

### Svelte

> Rapidly changing UI look

![svelte-1](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20svelte%201.gif)

### TypeScript + JSX

> Rapidly changing UI look

![tsx-1](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20tsx%201.gif)

### Python

**NOTE**: Force moving in Python almost never works correctly,
since whitespace is meaningful

> Moving methods and classes with decorators

![python-1](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20python%201.gif)

## Code Blocks editor

This editor displays all blocks in the current file, in a custom editor.
To move a block, click the source block, and then the block to move it under.

### Rust

> Moving method in and around `impl` block

![rust-1](./assets/editor/Code%20Blocks%20Demo%20-%20Editor%20-%20rust%201.gif)

> Moving `match` arms

![rust-2](./assets/editor/Code%20Blocks%20Demo%20-%20Editor%20-%20rust%202.gif)

### Svelte

> Rapidly changing UI look

![svelte-1](./assets/editor/Code%20Blocks%20Demo%20-%20Editor%20-%20svelte%201.gif)

### TypeScript + JSX

> Rapidly changing UI look

![tsx-1](./assets/editor/Code%20Blocks%20Demo%20-%20Editor%20-%20react%201.gif)

### Python

**NOTE**: Force moving in Python almost never works correctly,
since whitespace is meaningful

> Moving methods and classes with decorators

![python-1](./assets/editor/Code%20Blocks%20Demo%20-%20Editor%20-%20python%201.gif)

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
- [x] Java

Next up:

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

<p align="center">
<a href="https://github.com/selfint/code-blocks">
<img src="./assets/extension-logo.png"alt="logo" width='128'/>
</a>
</p>

<p align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=selfint.code-blocks" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/v/selfint.code-blocks.svg?color=blue&amp;label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="Visual Studio Marketplace Version" /></a>
<a href="https://marketplace.visualstudio.com/items?itemName=selfint.code-blocks" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/d/selfint.code-blocks.svg?color=4bdbe3" alt="Visual Studio Marketplace Downloads" /></a>
<a href="https://marketplace.visualstudio.com/items?itemName=selfint.code-blocks" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/i/selfint.code-blocks.svg?color=63ba83" alt="Visual Studio Marketplace Installs" /></a>
<br/>
<a href="https://github.com/selfint/code-blocks/actions/workflows/vscode-extension-ci-cd.yml" target="__blank"><img alt="GitHub CI" src="https://img.shields.io/github/actions/workflow/status/selfint/code-blocks/vscode-extension-ci-cd.yml"></a>
<a href="https://github.com/selfint/code-blocks" target="__blank"><img src="https://img.shields.io/github/last-commit/selfint/code-blocks.svg?color=c977be" alt="GitHub last commit" /></a>
<a href="https://github.com/selfint/code-blocks/issues" target="__blank"><img src="https://img.shields.io/github/issues/selfint/code-blocks.svg?color=a38eed" alt="GitHub issues" /></a>
<a href="https://github.com/selfint/code-blocks" target="__blank"><img alt="GitHub stars" src="https://img.shields.io/github/stars/selfint/code-blocks?style=social"></a>

</p>

<br>

  <h1><p align="center">Code blocks</p></h1>

Supercharge your editor with syntactically aware code navigation and manipulation, **_in any language_** supported by [tree-sitter](https://tree-sitter.github.io/tree-sitter/#parsers).

## Features

### Block mode

Syntactically aware code selection (e.g. select scope), navigation (e.g. goto next function)
and manipulation (e.g. re-order function parameters), right inside your editor.

<p align="center">
<img width="49%" src="./assets/block-mode/Code Blocks Demo - Block Mode - rust 1.gif" />
<img width="49%" src="./assets/block-mode/Code Blocks Demo - Block Mode - svelte 1.gif" />
</p>

### Code Blocks Editor

Birds eye view over all your code blocks, with point and click refactoring.

![svelte-1](./assets/editor/Code%20Blocks%20Demo%20-%20Editor%20-%20svelte%201.gif)

## Requirements

-   `node` / `npm`: Used to download tree-sitter language parsers. Can be installed from [here](https://nodejs.org/en/download).

-   `tree-sitter`: Used to build tree-sitter language parsers. After installing `npm`, can be installed by running:

    ```console
    $ npm i -g tree-sitter
    ```

-   `emcc`: Emscripten compiler, used by `tree-sitter` to compile parsers to WASM. Can be provided either through:

    -   [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) (preferred): Provides `emcc` directly.

    -   [Docker](https://docs.docker.com/get-docker/): Provides `emcc` via the [`emscripten/emsdk`](https://hub.docker.com/r/emscripten/emsdk) image. Note that the first parser installation can take some time (depending on internet speed), since the image is 1.68GB. Next installs will re-use the image and should take a few seconds at most.

## Commands

| Command                            | Usage                                                           |
| ---------------------------------- | --------------------------------------------------------------- |
| `codeBlocks.toggleActive`          | Toggle auto-parsing current file                                |
| `codeBlocks.toggleBlockMode`       | Toggle Block Mode, will `toggleActive` if auto-parsing disabled |
| `codeBlocks.toggleBlockModeColors` | Toggle Block Mode sibling/parent highlights                     |
| `codeBlocks.open`                  | Reopen current file with Code Blocks editor                     |
| `codeBlocks.openToTheSide`         | Open current file with Code Blocks editor on the side           |
| `codeBlocks.openTreeViewer`        | View current file syntax tree                                   |
| `codeBlocks.moveUp`                | Swap block with its previous sibling                            |
| `codeBlocks.moveDown`              | Swap block with its next sibling                                |
| `codeBlocks.moveUpForce`           | Move block before its parent                                    |
| `codeBlocks.moveDownForce`         | Move block after its parent                                     |
| `codeBlocks.navigateUp`            | Navigate to previous sibling                                    |
| `codeBlocks.navigateDown`          | Navigate to next sibling                                        |
| `codeBlocks.navigateUpForce`       | Navigate to parent start                                        |
| `codeBlocks.navigateDownForce`     | Navigate to parent end                                          |
| `codeBlocks.selectBlock`           | Expand selection to previous sibling                            |
| `codeBlocks.selectPrevious`        | Expand selection to previous sibling                            |
| `codeBlocks.selectNext`            | Expand selection to next sibling                                |
| `codeBlocks.selectParent`          | Expand selection to parent                                      |
| `codeBlocks.selectChild`           | Contract selection to first child                               |

## Keybindings

These are the default key bindings, they are only active when "block mode" is active, and when the cursor is inside a text editor tab:

| Command                        | Keybinding (cmd on mac) |
| ------------------------------ | ----------------------- |
| `codeBlocks.moveUp`            | `alt+left`              |
| `codeBlocks.moveDown`          | `alt+right`             |
| `codeBlocks.moveUpForce`       | `alt+up`                |
| `codeBlocks.moveDownForce`     | `alt+down`              |
| `codeBlocks.navigateUp`        | `ctrl/cmd+left`         |
| `codeBlocks.navigateDown`      | `ctrl/cmd+right`        |
| `codeBlocks.navigateUpForce`   | `ctrl/cmd+up`           |
| `codeBlocks.navigateDownForce` | `ctrl/cmd+down`         |
| `codeBlocks.selectBlock`       | -                       |
| `codeBlocks.selectPrevious`    | `shift+left`            |
| `codeBlocks.selectNext`        | `shift+right`           |
| `codeBlocks.selectParent`      | `shift+up`              |
| `codeBlocks.selectChild`       | `shift+down`            |

## Configuration

### Global

-   `codeBlocks.colors.enabled`: Whether Block Mode should color selections or not. Defaults to `true`.
-   `codeBlocks.colors.sibling`: CSS string for sibling selection background color. Defaults to `var(--vscode-editor-selectionHighlightBackground)`.
-   `codeBlocks.colors.parent`: CSS string for parent selection background color. Defaults to `var(--vscode-editor-linkedEditingBackground)`.
-   `codeBlocks.ignoredLanguageIds`: Array of VScode [languageId](https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers)s not to install/load parsers for.

### Language specific (advanced)

These configurations are set at the [languageId](https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers) level.

Most languages should just work™, if you find a language that requires manual configuration please [create an issue](https://github.com/selfint/code-blocks/issues).
Or [create a pull request](https://github.com/selfint/code-blocks/pulls) with your configuration added to the `configurationDefaults` section of the `package.json` file.

-   `codeBlocks.npmPackageName`: [NPM](https://www.npmjs.com/) package name of the `tree-sitter` parser to use for the
    language. Defaults to `tree-sitter-<languageId>`, change if the package name doesn't match the languageId.

-   `codeBlocks.parserName`: Filename of the WASM parser built by the `tree-sitter build-wasm` command, without the
    `.wasm` extension. Defaults to `tree-sitter-<languageId>`, change if the parser filename doesn't match the languageId.

-   `codeBlocks.subdirectory`: Directory inside the NPM package containing the `tree-sitter` grammar. Defaults to the
    root directory of the package, change if the grammar isn't there.

-   `codeBlocks.queries`: Tree-sitter [queries](https://tree-sitter.github.io/tree-sitter/using-parsers#query-syntax)
    to generate blocks, must contain at least one `@capture`. The name of the capture doesn't matter, the entire match will be a block.

    Required by [Code Blocks Editor](#code-blocks-editor).

    Optional for [Block Mode](#block-mode) - will auto-expand a selection if it is contained by a block.

#### **Example configuration for `tsx`**

Language ID: `typescriptreact`

NPM package name: [tree-sitter-typescript](https://www.npmjs.com/package/tree-sitter-typescript)

WASM parser name: `tree-sitter-ts.wasm`

Desired blocks: JSX blocks. Documentation comments should be merged with documentees.

```jsonc
{
    // language ID of .tsx files is 'typescriptreact'
    "[typescriptreact]": {
        // languageID != package name
        "codeBlocks.npmPackageName": "tree-sitter-typescript",
        // languageID != parser name
        "codeBlocks.parserName": "tree-sitter-tsx",
        // tree-sitter-typescript package contains a 'typescript' dir and a 'tsx' dir, so we need to specify 'tsx
        "codeBlocks.subdirectory": "tsx",
        "codeBlocks.queries": [
            // group documentation comments with their documentees
            "( (comment)* @header . (class_declaration) @item)",
            "( (comment)* @header . (method_definition) @item)",
            "( (comment)* @header . (function_declaration) @item)",
            "( (comment)* @header . (export_statement) @item)",
            // build blocks from jsx elements
            "(jsx_element) @item",
            "(jsx_self_closing_element) @item"
        ]
    }
}
```

### Custom editors

-   Code Blocks Editor (viewType `codeBlocks.editor`): UI for moving code blocks inside a file. Useful when refactoring large blocks over long distances.

## Known Issues

-   Out of bounds memory access ([#154](https://github.com/selfint/code-blocks/issues/154)): For now, reloading the editor fixes this.

## Gallery

### Rust

> Moving method in and around `impl` block

![rust-2](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20rust%202.gif)

> Moving `match` arms

![rust-1](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20rust%201.gif)

### Svelte

> Rapidly changing UI look

![svelte-1](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20svelte%201.gif)

### React (TypeScript + JSX)

> Rapidly changing UI look

![react-1](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20react%201.gif)

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
since whitespace is meaningful it's a bit tricky. Hopefully in the future
this is stabilized.

> Moving methods and classes with decorators

## License

MIT License © 2023 [Tom Selfin](https://github.com/selfint)

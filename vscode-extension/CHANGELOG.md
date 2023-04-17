# Release Notes

# 0.5.2

## New

## Fixed

- Moving blocks rapidly is unstable.
- Python: Force move erros.

# 0.5.1

## New

- Change "force" semantics:

  Blocks that require a force move/navigate are detected in advance,
  and trying to move/navigate to them will fail silently. Instead of
  the old error notification, the background of the blocks is
  now a different color.

- Add block navigation commands:

  Regular "navigate" commands will not navigate to parent scope,
  for that there are the "force navigate" commands.

  ![block-mode-navigation-demo](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20navigation%201.gif)

- Make "block mode" a vscode context (useful for keybindings).
- Add "block mode" status bar indicator.
- Add "select current block" command:

  ![block-mode-select-demo](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20select%201.gif)

- Add configurable colors:

  Default values:

  ```json
  "codeBlocks.colors": {
    "selected": "var(--vscode-inputOption-activeBackground)",
    "target": "var(--vscode-editor-selectionHighlightBackground)",
    "forceTarget": "var(--vscode-editor-linkedEditingBackground)"
  }
  ```

  Each value is a css string that is passed to the `background-color` property
  of the respective block type. It can be any valid css value.

- Add default keybindings (only active when "block mode" is on):

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

  Note that `codeBlocks.toggle`, the old editor commands, and
  `codeBlocks.selectBlock` are not bound by default.

## Fixed

- Blocks appearing in files with unsupported languages.

# 0.5.0

## New

- Add "block mode":

  ![block-mode-demo](./assets/block-mode/Code%20Blocks%20Demo%20-%20Block%20Mode%20-%20rust%201.gif)

## Fixed

- `code-blocks-cli` not updated between vscode extension versions.
- "Installing tree_sitter_XXX" notification on every command.
- Spacing around blocks in the Editor view too small.

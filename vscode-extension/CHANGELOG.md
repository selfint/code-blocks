# Release Notes

# 0.5.1

## New

- Add block navigation commands.
- Make "block mode" a vscode context (useful for keybindings).
- Add "select current block" command.
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

  Note that `codeBlocks.toggle`, the editor commands, and the
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

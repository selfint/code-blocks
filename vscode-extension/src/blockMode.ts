import * as core from "./core";
import * as vscode from "vscode";
import { BlockLocation, BlockLocationTree, GetSubtreesArgs, GetSubtreesResponse, MoveBlockArgs, MoveBlockResponse } from "./codeBlocksWrapper/types";
import { join } from "path";

/**
 * Either a selected block and possible siblings OR no selections.
 */
type Selections = [TargetLocation | undefined, BlockLocation, TargetLocation | undefined] | undefined;
type TargetLocation = [BlockLocation, boolean];

export function getBlockModeCommands(context: vscode.ExtensionContext): Map<string, () => unknown> {
  let blockMode: BlockMode | undefined = undefined;

  const commands = new Map<string, () => unknown>();

  commands.set("toggle", async () => {
    if (blockMode === undefined) {
      blockMode = await BlockMode.build(context);
    } else {
      await blockMode.dispose();
      blockMode = undefined;
    }
  });

  commands.set("moveUp", async () => await blockMode?.moveBlock("up", false));
  commands.set("moveDown", async () => await blockMode?.moveBlock("down", false));
  commands.set("moveUpForce", async () => await blockMode?.moveBlock("up", true));
  commands.set("moveDownForce", async () => await blockMode?.moveBlock("down", true));
  commands.set("navigateUp", () => blockMode?.navigateBlocks("up", false));
  commands.set("navigateDown", () => blockMode?.navigateBlocks("down", false));
  commands.set("navigateUpForce", () => blockMode?.navigateBlocks("up", true));
  commands.set("navigateDownForce", () => blockMode?.navigateBlocks("down", true));
  commands.set("selectBlock", () => blockMode?.selectBlock());

  return commands;
}


class BlockMode implements vscode.Disposable {

  selectedDecoration: vscode.TextEditorDecorationType;
  targetsDecoration: vscode.TextEditorDecorationType;
  forceTargetsDecoration: vscode.TextEditorDecorationType;
  codeBlocksCliPath: string;
  parsersDir: string;

  editorState: EditorState | undefined = undefined;

  disposables: vscode.Disposable[];

  public static async build(context: vscode.ExtensionContext): Promise<BlockMode | undefined> {
    const parsersDir = join(context.extensionPath, "parsers");
    const binDir = join(context.extensionPath, "bin");
    const codeBlocksCliPath = await core.getCodeBlocksCliPath(binDir);
    if (codeBlocksCliPath === undefined) {
      console.log("Didn't get code blocks cli path");
      return undefined;
    }

    const configColors: { selected: string | undefined, target: string | undefined, forceTarget: string | undefined } | undefined = vscode.workspace
      .getConfiguration("codeBlocks")
      .get("colors");

    const colors = {
      selected: configColors?.selected ?? "var(--vscode-inputOption-activeBackground)",
      target: configColors?.target ?? "var(--vscode-editor-selectionHighlightBackground)",
      forceTarget: configColors?.forceTarget ?? "var(--vscode-editor-linkedEditingBackground)",
    };

    const blockMode = new BlockMode(parsersDir, codeBlocksCliPath, colors);

    await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", true);

    if (vscode.window.activeTextEditor !== undefined) {
      await blockMode.openEditor(vscode.window.activeTextEditor);
    }

    return blockMode;
  }

  private constructor(parsersDir: string, codeBlocksCliPath: string, colors: { selected: string, target: string, forceTarget: string }) {
    this.parsersDir = parsersDir;
    this.codeBlocksCliPath = codeBlocksCliPath;
    this.selectedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.selected,
    });
    this.targetsDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.target,
    });
    this.forceTargetsDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.forceTarget,
    });

    this.disposables = [
      vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left),
      vscode.window.setStatusBarMessage("-- BLOCK MODE --"),
      vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (editor === undefined) {
          this.closeEditor();
        } else if (this.editorState?.ofEditor !== editor) {
          this.closeEditor();
          await this.openEditor(editor);
        }
      }),

      vscode.workspace.onDidChangeTextDocument(async documentChanged => {
        if (this.editorState?.ofEditor.document === documentChanged.document) {
          await this.updateEditorState();
        }
      }),

      vscode.window.onDidChangeTextEditorSelection(selection => {
        this.updateEditorSelections(selection.selections[0].active);
      })
    ];
  }

  async dispose(): Promise<void> {
    await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", false);
    await Promise.all(this.disposables.map(async d => { await d.dispose(); }));
    this.closeEditor();
  }

  private async openEditor(editor: vscode.TextEditor): Promise<void> {
    const wrapper = await EditorCoreWrapper.build(editor, this.codeBlocksCliPath, this.parsersDir);
    if (wrapper === undefined) {
      return;
    }

    this.editorState = new EditorState(editor, wrapper);
    await this.updateEditorState();
  }

  private closeEditor(): void {
    this.editorState?.ofEditor.setDecorations(this.selectedDecoration, []);
    this.editorState?.ofEditor.setDecorations(this.targetsDecoration, []);
    this.editorState?.ofEditor.setDecorations(this.forceTargetsDecoration, []);
    this.editorState = undefined;
  }

  private async updateEditorState(): Promise<void> {
    if (this.editorState === undefined) {
      return;
    }

    this.editorState.blocks = await this.editorState.editorCoreWrapper.getBlocks(
      this.editorState.ofEditor.document.getText()
    );

    this.updateEditorSelections(this.editorState.ofEditor.selection.active);
  }

  private updateEditorSelections(selection: vscode.Position): void {
    if (this.editorState === undefined) {
      return;
    }

    this.editorState.selections = findSelections(
      this.editorState.blocks,
      selection,
    );

    this.highlightSelections();
    this.focusSelection(this.editorState.ofEditor.selection.active);
  }

  private focusSelection(selection: vscode.Position): void {
    if (this.editorState === undefined) {
      return;
    }

    for (const visibleRange of this.editorState.ofEditor.visibleRanges) {
      if (visibleRange.contains(selection)) {
        return;
      }
    }

    this.editorState.ofEditor.revealRange(
      new vscode.Range(selection, selection),
      vscode.TextEditorRevealType.Default
    );
  }

  private highlightSelections(): void {
    if (this.editorState?.selections !== undefined) {
      const [prev, selected, next] = this.editorState.selections;
      const range = new vscode.Range(selected.startRow, selected.startCol, selected.endRow, selected.endCol);
      this.editorState.ofEditor.setDecorations(this.selectedDecoration, [range]);

      const targetRanges = [];
      const forceTargetRanges = [];
      if (prev !== undefined) {
        const [prevBlock, prevForce] = prev;
        if (prevForce) {
          forceTargetRanges.push(new vscode.Range(prevBlock.startRow, prevBlock.startCol, prevBlock.endRow, prevBlock.endCol));
        } else {
          targetRanges.push(new vscode.Range(prevBlock.startRow, prevBlock.startCol, prevBlock.endRow, prevBlock.endCol));
        }
      }

      if (next !== undefined) {
        const [nextBlock, nextForce] = next;
        if (nextForce) {
          forceTargetRanges.push(new vscode.Range(nextBlock.startRow, nextBlock.startCol, nextBlock.endRow, nextBlock.endCol));
        } else {
          targetRanges.push(new vscode.Range(nextBlock.startRow, nextBlock.startCol, nextBlock.endRow, nextBlock.endCol));
        }
      }

      this.editorState.ofEditor.setDecorations(this.targetsDecoration, targetRanges);
      this.editorState.ofEditor.setDecorations(this.forceTargetsDecoration, forceTargetRanges);
    } else {
      this.editorState?.ofEditor.setDecorations(this.selectedDecoration, []);
      this.editorState?.ofEditor.setDecorations(this.targetsDecoration, []);
      this.editorState?.ofEditor.setDecorations(this.forceTargetsDecoration, []);
    }
  }

  public async moveBlock(direction: "up" | "down", force: boolean): Promise<void> {
    if (this.editorState?.selections === undefined) {
      console.log("No selected block to move");
      return;
    }

    const editor = this.editorState.ofEditor;
    const document = this.editorState.ofEditor.document;
    const coreWrapper = this.editorState.editorCoreWrapper;
    const [prev, selected, next] = this.editorState.selections;

    let srcBlock: BlockLocation | undefined = undefined;
    let dstBlock: BlockLocation | undefined = undefined;
    switch (direction) {
      case "up":
        srcBlock = prev?.[0];
        dstBlock = selected;
        break;

      case "down":
        srcBlock = selected;
        dstBlock = next?.[0];
        break;
    }

    if (srcBlock === undefined || dstBlock === undefined) {
      console.log("Missing move target block");
      return;
    }

    const moveBlockResponse = await coreWrapper.moveBlock(
      document.getText(), srcBlock, dstBlock, force
    );

    if (moveBlockResponse === undefined) {
      console.log("Failed to move block");
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      editor.document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      moveBlockResponse.text
    );

    const cursorByte = document.offsetAt(editor.selection.active);
    const cursorSelectedBlockOffset = cursorByte - selected.startByte;

    await vscode.workspace.applyEdit(edit);

    const newOffset = direction === "down" ? moveBlockResponse.newSrcStart : moveBlockResponse.newDstStart;
    const newPosition = document.positionAt(newOffset + cursorSelectedBlockOffset);
    const newSelection = new vscode.Selection(newPosition, newPosition);

    editor.selection = newSelection;
  }

  public navigateBlocks(direction: "up" | "down", force: boolean): void {
    if (this.editorState?.selections === undefined) {
      return;
    }

    const [prev, , next] = this.editorState.selections;

    switch (direction) {
      case "up":
        if (prev !== undefined) {
          const [prevBlock, prevForce] = prev;
          if (!prevForce || force) {
            const selection = this.editorState.ofEditor.document.positionAt(prevBlock.startByte);
            this.editorState.ofEditor.selection = new vscode.Selection(selection, selection);
            this.focusSelection(selection);
          }
        }
        return;

      case "down":
        if (next !== undefined) {
          const [nextBlock, nextForce] = next;
          if (!nextForce || force) {
            const selection = this.editorState.ofEditor.document.positionAt(nextBlock.startByte);
            this.editorState.ofEditor.selection = new vscode.Selection(selection, selection);
            this.focusSelection(selection);
          }
        }
        return;
    }
  }

  public selectBlock(): void {
    if (this.editorState?.selections === undefined) {
      return;
    }

    const [, selectedBlock,] = this.editorState.selections;

    const anchor = this.editorState.ofEditor.document.positionAt(selectedBlock.startByte);
    const active = this.editorState.ofEditor.document.positionAt(selectedBlock.endByte);
    const newSelection = new vscode.Selection(anchor, active);

    this.editorState.ofEditor.selection = newSelection;
  }
}


class EditorState {
  ofEditor: vscode.TextEditor;
  editorCoreWrapper: EditorCoreWrapper;
  blocks: BlockLocationTree[] | undefined;
  selections: Selections = undefined;

  constructor(editor: vscode.TextEditor, editorCoreWrapper: EditorCoreWrapper) {
    this.ofEditor = editor;
    this.editorCoreWrapper = editorCoreWrapper;
  }
}


class EditorCoreWrapper {
  private codeBlocksCliPath: string;
  private languageSupport: core.LanguageSupport;
  private libraryPath: string;

  public static async build(
    editor: vscode.TextEditor,
    codeBlocksCliPath: string,
    parsersDir: string
  ): Promise<EditorCoreWrapper | undefined> {
    const languageSupport = core.getLanguageSupport(editor.document.languageId);
    if (languageSupport === undefined) {
      console.log(`Got unsupported languageId: ${editor.document.languageId}`);
      return undefined;
    }

    const libraryPath = await core.cachedInstallLanguage(
      codeBlocksCliPath,
      {
        installDir: join(parsersDir, languageSupport.parserInstaller.libraryName),
        ...languageSupport.parserInstaller,
      },
    );
    if (libraryPath === undefined) {
      console.log(`Failed to install language: ${languageSupport.parserInstaller.libraryName}`);
      return undefined;
    }

    return new EditorCoreWrapper(codeBlocksCliPath, languageSupport, libraryPath);
  }

  constructor(
    codeBlocksCliPath: string,
    languageSupport: core.LanguageSupport,
    libraryPath: string,
  ) {
    this.codeBlocksCliPath = codeBlocksCliPath;
    this.languageSupport = languageSupport;
    this.libraryPath = libraryPath;
  }

  public async getBlocks(text: string): Promise<GetSubtreesResponse | undefined> {
    const args: GetSubtreesArgs = {
      queries: this.languageSupport.queries,
      text,
      libraryPath: this.libraryPath,
      languageFnSymbol: this.languageSupport.parserInstaller.languageFnSymbol,
    };

    return await core.getBlocks(this.codeBlocksCliPath, args);
  }

  public async moveBlock(
    text: string,
    srcBlock: BlockLocation,
    dstBlock: BlockLocation,
    force: boolean,
  ): Promise<MoveBlockResponse | undefined> {
    const args: MoveBlockArgs = {
      queries: this.languageSupport.queries,
      text,
      libraryPath: this.libraryPath,
      languageFnSymbol: this.languageSupport.parserInstaller.languageFnSymbol,
      srcBlock,
      dstBlock,
      force,
    };

    return await core.moveBlock(this.codeBlocksCliPath, args, false);
  }
}


function findSelections(blocks: BlockLocationTree[] | undefined, cursor: vscode.Position): Selections {
  if (blocks === undefined) {
    return undefined;
  }

  function cursorInBlock(block: BlockLocation): boolean {
    return cursor.isAfterOrEqual(new vscode.Position(block.startRow, block.startCol))
      && cursor.isBefore(new vscode.Position(block.endRow, block.endCol));
  }

  function findTreesSelections(trees: BlockLocationTree[]): Selections {
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];

      if (!cursorInBlock(tree.block)) {
        continue;
      }

      const selections = findTreesSelections(tree.children);
      if (selections !== undefined) {
        const [childPrev, selected, childNext] = selections;
        if (childNext === undefined) {
          return [childPrev, selected, [tree.block, true]];
        } else {
          return selections;
        }
      }

      const prev: TargetLocation | undefined = i > 0 ? [trees[i - 1].block, false] : undefined;
      const next: TargetLocation | undefined = i < trees.length - 1 ? [trees[i + 1].block, false] : undefined;

      return [prev, tree.block, next];
    }

    return undefined;
  }

  return findTreesSelections(blocks);
}

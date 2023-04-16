import * as core from "./core";
import * as vscode from "vscode";
import { BlockLocation, BlockLocationTree, GetSubtreesArgs, GetSubtreesResponse, MoveBlockArgs, MoveBlockResponse } from "./codeBlocksWrapper/types";
import { join } from "path";

/**
 * Either a selected block and possible siblings OR no selections.
 */
type Selections = [TargetLocation | undefined, BlockLocation, TargetLocation | undefined] | undefined;
type TargetLocation = [BlockLocation, boolean];
type ConfigColors = {
  selected: string | undefined;
  target: string | undefined;
  forceTarget: string | undefined;
};


export function registerBlockModeCommands(context: vscode.ExtensionContext): void {
  function registerCommand(name: string, callback: () => unknown): void {
    vscode.commands.registerCommand(`codeBlocks.${name}`, callback);
  }

  let blockMode: BlockMode | undefined = undefined;

  registerCommand("toggle", async () => {
    if (blockMode === undefined) {
      blockMode = await BlockMode.build(context);
    } else {
      await blockMode.dispose();
      blockMode = undefined;
    }
  });
  registerCommand("moveUp", async () => await blockMode?.moveBlock("up", false));
  registerCommand("moveDown", async () => await blockMode?.moveBlock("down", false));
  registerCommand("moveUpForce", async () => await blockMode?.moveBlock("up", true));
  registerCommand("moveDownForce", async () => await blockMode?.moveBlock("down", true));
  registerCommand("navigateUp", () => blockMode?.navigateBlocks("up", false));
  registerCommand("navigateDown", () => blockMode?.navigateBlocks("down", false));
  registerCommand("navigateUpForce", () => blockMode?.navigateBlocks("up", true));
  registerCommand("navigateDownForce", () => blockMode?.navigateBlocks("down", true));
  registerCommand("selectBlock", () => blockMode?.selectBlock());
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
    console.log("build");
    const parsersDir = join(context.extensionPath, "parsers");
    const binDir = join(context.extensionPath, "bin");
    const codeBlocksCliPath = await core.getCodeBlocksCliPath(binDir);
    if (codeBlocksCliPath === undefined) {
      console.log("Didn't get code blocks cli path");
      return undefined;
    }

    const configColors: ConfigColors | undefined = vscode.workspace
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

  private constructor(parsersDir: string, codeBlocksCliPath: string, colors: ConfigColors) {
    console.log("constructor");
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
          const v = documentChanged.document.version;
          console.log(`got document changed event, version: ${v}`);
          await this.updateEditorBlocks(documentChanged.document.getText(), v);
        }
      }),

      vscode.window.onDidChangeTextEditorSelection(selection => {
        const v = selection.textEditor.document.version;
        console.log(`got selection changed event, version: ${v}`);
        return this.updateEditorSelections(selection.selections[0].active, v);
      })
    ];
  }

  async dispose(): Promise<void> {
    console.log("dispose");
    await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", false);
    await Promise.all(this.disposables.map(async d => { await d.dispose(); }));
    this.closeEditor();
  }

  private async openEditor(editor: vscode.TextEditor): Promise<void> {
    console.log("openEditor");
    const wrapper = await EditorCoreWrapper.build(editor, this.codeBlocksCliPath, this.parsersDir);
    if (wrapper === undefined) {
      return;
    }

    this.editorState = new EditorState(editor, wrapper);
    await this.updateEditorBlocks(editor.document.getText(), editor.document.version);
    this.updateEditorSelections(editor.selection.active, editor.document.version);
  }

  private closeEditor(): void {
    console.log("closeEditor");
    this.editorState?.ofEditor.setDecorations(this.selectedDecoration, []);
    this.editorState?.ofEditor.setDecorations(this.targetsDecoration, []);
    this.editorState?.ofEditor.setDecorations(this.forceTargetsDecoration, []);
    this.editorState = undefined;
  }

  private async updateEditorBlocks(text: string, version: number): Promise<void> {
    console.log(`updateEditorState, version: ${version}`);
    if (this.editorState === undefined) {
      return;
    }

    if (this.editorState.ofEditor.document.version > version) {
      console.log("skipping old block event");
      return;
    }

    if (version <= this.editorState.staleVersion) {
      console.log("got stale block event");
      return;
    } else {
      console.log("got valid block event");
    }

    const wrapper = this.editorState.editorCoreWrapper;
    const oldBlockVersion = this.editorState.blockVersion;
    this.editorState.blockVersion = version;
    try {
      this.editorState.blocks = await wrapper.getBlocks(text);
    } catch (e) {
      this.editorState.blockVersion = oldBlockVersion;
    }

    this.updateEditorSelections(this.editorState.ofEditor.selection.active, version);

    console.log("done updateEditorState");
  }

  private updateEditorSelections(position: vscode.Position | undefined, version: number): void {
    console.log(`updateEditorSelections, version: ${version}`);
    if (this.editorState === undefined || position === undefined) {
      return;
    }

    if (this.editorState.ofEditor.document.version > version) {
      console.log("skipping old selection event");
      return;
    }

    if (version <= this.editorState.staleVersion) {
      console.log(`got stale selection event, version: ${version} stale: ${this.editorState.staleVersion}`);
      return;
    } else {
      console.log("got valid selection event");
    }

    if (this.editorState.blockVersion === undefined || this.editorState.blockVersion < version) {
      console.log("got stale selection blocks");
      return;
    } else {
      console.log("got valid selection blocks");
    }

    const selections = findSelections(this.editorState.blocks, position);
    this.editorState.selections = selections;
    this.editorState.selectionVersion = version;

    this.highlightSelections(selections);
    console.log("done updateEditorSelections");
  }

  private focusSelection(selection: vscode.Position): void {
    console.log("focusSelection");
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
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
  }

  private highlightSelections(selections: Selections): void {
    console.log("highlightSelections");
    if (this.editorState !== undefined && selections !== undefined) {
      const [prev, selected, next] = selections;
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

  async moveBlock(direction: "up" | "down", force: boolean): Promise<void> {
    if (this.editorState === undefined) {
      return;
    }

    const editor = this.editorState.ofEditor;
    const document = this.editorState.ofEditor.document;
    const coreWrapper = this.editorState.editorCoreWrapper;
    console.log(`moveBlock, version: ${document.version}`);

    if (document.version <= this.editorState.staleVersion) {
      console.log("got stale move event");
      return;
    }


    if (this.editorState.blockVersion !== document.version) {
      console.log("got invalid block version");
      return;
    } else {
      console.log("got valid block version");
    }

    if (this.editorState.selectionVersion !== document.version) {
      console.log("got invalid selection version");
      return;
    } else {
      console.log("got valid selection version");
    }

    if (this.editorState.selections === undefined) {
      console.log("No selected block to move");
      return;
    }

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

    const cursorByte = document.offsetAt(editor.selection.active);
    const cursorSelectedBlockOffset = cursorByte - selected.startByte;

    // if something fails we will revert the stale version to the current stale version
    const oldStaleVersion = this.editorState.staleVersion;

    this.editorState.staleVersion = document.version;

    const moveBlockResponse = await coreWrapper.moveBlock(
      document.getText(), srcBlock, dstBlock, force
    );

    // rollback stale version if move failed, and exit
    if (moveBlockResponse === undefined) {
      console.log("Failed to move block");
      this.editorState.staleVersion = oldStaleVersion;
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      editor.document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      moveBlockResponse.text
    );

    await vscode.workspace.applyEdit(edit);
    // rollback stale version if edit failed, and exit
    if (document.version === this.editorState.staleVersion) {
      this.editorState.staleVersion = oldStaleVersion;
      return;
    }

    const newOffset = direction === "down" ? moveBlockResponse.newSrcStart : moveBlockResponse.newDstStart;
    const newPosition = document.positionAt(newOffset + cursorSelectedBlockOffset);
    const newSelection = new vscode.Selection(newPosition, newPosition);

    editor.selection = newSelection;

    const newVersion = document.version;
    await this.updateEditorBlocks(moveBlockResponse.text, newVersion);
    this.updateEditorSelections(newPosition, newVersion);

    this.focusSelection(newPosition);

    console.log("done moveBlock");
  }

  public navigateBlocks(direction: "up" | "down", force: boolean): void {
    console.log("navigateBlocks");

    if (this.editorState?.selections === undefined) {
      return;
    }

    if (
      this.editorState.selectionVersion === undefined
      || this.editorState.selectionVersion < this.editorState.ofEditor.document.version
    ) {
      console.log("got stale selection version");
      return;
    } else {
      console.log("got valid selection version");
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
    console.log("selectBlock");
    if (this.editorState?.selections === undefined) {
      return;
    }

    if (
      this.editorState.selectionVersion === undefined
      || this.editorState.selectionVersion < this.editorState.ofEditor.document.version
    ) {
      console.log("got stale selection version");
      return;
    } else {
      console.log("got valid selection version");
    }

    const [, selectedBlock,] = this.editorState.selections;

    const anchor = this.editorState.ofEditor.document.positionAt(selectedBlock.startByte);
    const active = this.editorState.ofEditor.document.positionAt(selectedBlock.endByte);
    const newSelection = new vscode.Selection(anchor, active);

    this.editorState.ofEditor.selection = newSelection;
  }
}


class EditorState {
  readonly ofEditor: vscode.TextEditor;
  readonly editorCoreWrapper: EditorCoreWrapper;

  blocks: BlockLocationTree[] | undefined;
  selections: Selections = undefined;
  blockVersion: number | undefined;
  selectionVersion: number | undefined;

  /** mark stale version to prevent other modifications before the move finishes
   *
   * Since JavaScript doesn't have a notion of "locking" memory across `async`
   * calls, we need this hack to ensure no other modification is done to
   * the editor while we are performing the move operation.
   *
   * And because the move operation has `async` calls inside it, without
   * this "lock" we would get undefined behavior.
  */
  staleVersion: number;

  constructor(editor: vscode.TextEditor, editorCoreWrapper: EditorCoreWrapper) {
    this.ofEditor = editor;
    this.editorCoreWrapper = editorCoreWrapper;
    this.staleVersion = editor.document.version - 1;
    this.blockVersion = undefined;
    this.selectionVersion = undefined;
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
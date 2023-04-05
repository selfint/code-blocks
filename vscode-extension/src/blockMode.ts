import * as core from "./core";
import * as vscode from "vscode";
import { BlockLocation, BlockLocationTree, GetSubtreesArgs, GetSubtreesResponse, MoveBlockArgs, MoveBlockResponse } from "./codeBlocksWrapper/types";
import { join } from "path";

const selectedDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: "var(--vscode-editor-selectionBackground)",
});
const targetsDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: "var(--vscode-editor-selectionHighlightBackground)",
});

/**
 * Either a selected block and possible siblings OR no selections.
 */
type Selections = [BlockLocation | undefined, BlockLocation, BlockLocation | undefined] | undefined;

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

  return commands;
}


class BlockMode implements vscode.Disposable {
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

    const blockMode = new BlockMode(parsersDir, codeBlocksCliPath);
    if (vscode.window.activeTextEditor !== undefined) {
      await blockMode.openEditor(vscode.window.activeTextEditor);
    }

    return blockMode;
  }

  private constructor(parsersDir: string, codeBlocksCliPath: string) {
    this.parsersDir = parsersDir;
    this.codeBlocksCliPath = codeBlocksCliPath;

    this.disposables = [
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
    await Promise.all(this.disposables.map(async d => { await d.dispose(); }));
    this.closeEditor();
  }

  private closeEditor(): void {
    this.editorState?.ofEditor.setDecorations(selectedDecoration, []);
    this.editorState?.ofEditor.setDecorations(targetsDecoration, []);
    this.editorState = undefined;
  }

  private async openEditor(editor: vscode.TextEditor): Promise<void> {
    const wrapper = await EditorCoreWrapper.build(editor, this.codeBlocksCliPath, this.parsersDir);
    if (wrapper === undefined) {
      return;
    }

    this.editorState = new EditorState(editor, wrapper);
    await this.updateEditorState();
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

    highlightSelections(this.editorState.ofEditor, this.editorState.selections);
  }

  public async moveBlock(direction: "up" | "down", force: boolean): Promise<void> {
    if (this.editorState?.selections === undefined) {
      console.log("No selected block to move");
      return;
    }

    let srcBlock: BlockLocation | undefined = undefined;
    let dstBlock: BlockLocation | undefined = undefined;

    const [prev, selected, next] = this.editorState.selections;

    switch (direction) {
      case "up":
        srcBlock = prev;
        dstBlock = selected;
        break;

      case "down":
        srcBlock = selected;
        dstBlock = next;
        break;
    }

    if (srcBlock === undefined || dstBlock === undefined) {
      console.log("Missing move target block");
      return;
    }

    const editor = this.editorState.ofEditor;
    const document = this.editorState.ofEditor.document;
    const coreWrapper = this.editorState.editorCoreWrapper;
    const cursorByte = document.offsetAt(editor.selection.active);
    const cursorSelectedBlockOffset = cursorByte - selected.startByte;

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

    await vscode.workspace.applyEdit(edit);

    const newOffset = direction === "down" ? moveBlockResponse.newSrcStart : moveBlockResponse.newDstStart;

    const newPosition = document.positionAt(newOffset + cursorSelectedBlockOffset);
    const newSelection = new vscode.Selection(newPosition, newPosition);
    editor.selection = newSelection;

    this.updateEditorSelections(editor.selection.active);
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

    return await core.moveBlock(this.codeBlocksCliPath, args);
  }
}


function findSelections(blocks: BlockLocationTree[] | undefined, cursor: vscode.Position): Selections {
  if (blocks === undefined) {
    return undefined;
  }

  function cursorInBlock(block: BlockLocation): boolean {
    return cursor.isAfterOrEqual(new vscode.Position(block.startRow, block.startCol))
      && cursor.isBeforeOrEqual(new vscode.Position(block.endRow, block.endCol));
  }

  function findTreesSelections(
    trees: BlockLocationTree[]
  ): [BlockLocation | undefined, BlockLocation | undefined, BlockLocation | undefined] {
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];

      if (!cursorInBlock(tree.block)) {
        continue;
      }

      const [childPrev, selected, childNext] = findTreesSelections(tree.children);
      if (selected !== undefined) {
        return [childPrev, selected, childNext ?? tree.block];
      }

      const prev = i > 0 ? trees[i - 1].block : undefined;
      const next = i < trees.length - 1 ? trees[i + 1].block : undefined;

      return [prev, tree.block, next];
    }

    return [undefined, undefined, undefined];
  }

  const [prev, selected, next] = findTreesSelections(blocks);
  if (selected === undefined) {
    return undefined;
  } else {
    return [prev, selected, next];
  }
}

function highlightSelections(
  editor: vscode.TextEditor,
  selections: [BlockLocation | undefined, BlockLocation, BlockLocation | undefined] | undefined,
): void {
  if (selections !== undefined) {
    const [prev, selected, next] = selections;
    const range = new vscode.Range(selected.startRow, selected.startCol, selected.endRow, selected.endCol);
    editor.setDecorations(selectedDecoration, [range]);

    const targetRanges = [];
    if (prev !== undefined) {
      targetRanges.push(new vscode.Range(prev.startRow, prev.startCol, prev.endRow, prev.endCol));
    }

    if (next !== undefined) {
      targetRanges.push(new vscode.Range(next.startRow, next.startCol, next.endRow, next.endCol));
    }

    editor.setDecorations(targetsDecoration, targetRanges);
  } else {
    editor.setDecorations(selectedDecoration, []);
    editor.setDecorations(targetsDecoration, []);
  }
}
import * as core from "./core";
import * as vscode from "vscode";
import { BlockLocation, BlockLocationTree, GetSubtreesArgs, MoveBlockArgs } from "./codeBlocksWrapper/types";
import { join } from "path";

const selectedDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: "var(--vscode-editor-selectionBackground)",
});
const targetsDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: "var(--vscode-editor-selectionHighlightBackground)",
});

class BlockModeExtension {
  /**
   * This is used to ensure that events only trigger one action.
   */
  private runningLock = false;

  private editorState: EditorState | undefined;
  private enabled = false;
  private parsersDir: string;
  private codeBlocksCliPath: string;

  private activeEditor: vscode.TextEditor | undefined = undefined;
  private disposables: vscode.Disposable[] | undefined = undefined;

  private static instance: BlockModeExtension | undefined = undefined;

  private constructor(codeBlocksCliPath: string, parsersDir: string) {
    this.codeBlocksCliPath = codeBlocksCliPath;
    this.parsersDir = parsersDir;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  async syncStateWithActiveEditor(): Promise<EditorState | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (this.activeEditor === editor) {
      return this.editorState;
    } else {
      clearDecorations(this.activeEditor);
      this.activeEditor = editor;
      this.editorState = await EditorState.build(editor, this.codeBlocksCliPath, this.parsersDir);
    }
  }

  public static async getInstance(context: vscode.ExtensionContext): Promise<BlockModeExtension | undefined> {
    if (this.instance === undefined) {
      const binDir = join(context.extensionPath, "bin");
      const parsersDir = join(context.extensionPath, "parsers");

      const codeBlocksCliPath = await core.getCodeBlocksCliPath(binDir);
      if (codeBlocksCliPath === undefined) {
        return undefined;
      }

      this.instance = new BlockModeExtension(codeBlocksCliPath, parsersDir);
    }

    return this.instance;
  }

  async updateBlocks(): Promise<void> {
    if (this.editorState?.editor === undefined) {
      return;
    }

    const editor = this.editorState.editor;
    const codeBlocksCliPath = this.editorState.codeBlocksCliPath;
    const libraryPath = this.editorState.libraryPath;

    const textDocument = editor.document;
    const languageSupport = this.editorState.languageSupport;

    const args: GetSubtreesArgs = {
      languageFnSymbol: languageSupport.parserInstaller.languageFnSymbol,
      queries: languageSupport.queries,
      text: textDocument.getText(),
      libraryPath
    };

    const newBlocks = await core.getBlocks(codeBlocksCliPath, args);
    if (newBlocks === undefined) {
      console.log("failed to get blocks");
      return undefined;
    }

    if (newBlocks.length === 0) {
      console.log("got no blocks");
      return undefined;
    }

    this.editorState.blocks = newBlocks;
    this.updateSelection();
  }

  updateSelection(): void {
    if (this.editorState === undefined) {
      return undefined;
    }

    if (this.editorState.blocks === undefined) {
      return undefined;
    }

    const cursor = this.editorState.editor.selection.active;

    function cursorInBlock(block: BlockLocation): boolean {
      return cursor.isAfterOrEqual(new vscode.Position(block.startRow, block.startCol))
        && cursor.isBeforeOrEqual(new vscode.Position(block.endRow, block.endCol));
    }

    function findTreesSelections(trees: BlockLocationTree[]): [BlockLocation | undefined, BlockLocation | undefined, BlockLocation | undefined] {
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

    const [prev, selected, next] = findTreesSelections(this.editorState.blocks);

    this.editorState.selectedBlock = selected;
    this.editorState.selectedBlockSiblings = [prev, next];

    highlightSelections(this.editorState.editor, this.editorState.selectedBlock, this.editorState.selectedBlockSiblings);
  }

  async moveSelectedBlock(direction: "up" | "down", force: boolean): Promise<void> {
    if (this.editorState === undefined) {
      return undefined;
    }

    if (this.editorState.selectedBlock === undefined) {
      return undefined;
    }

    const languageSupport = this.editorState.languageSupport;

    let srcBlock: BlockLocation | undefined = undefined;
    let dstBlock: BlockLocation | undefined = undefined;

    const [prev, next] = this.editorState.selectedBlockSiblings;

    switch (direction) {
      case "up":
        srcBlock = prev;
        dstBlock = this.editorState.selectedBlock;
        break;

      case "down":
        srcBlock = this.editorState.selectedBlock;
        dstBlock = next;
        break;
    }

    if (srcBlock === undefined || dstBlock === undefined) {
      console.log("missing target block");
      return;
    }

    const cursorByte = this.editorState.editor.document.offsetAt(this.editorState.editor.selection.active);
    const cursorSelectedBlockOffset = cursorByte - this.editorState.selectedBlock.startByte;

    const moveBlockResponse = await core.moveBlock(this.editorState.codeBlocksCliPath, this.editorState.editor.document, {
      srcBlock,
      dstBlock,
      force,
      languageFnSymbol: languageSupport.parserInstaller.languageFnSymbol,
      queries: languageSupport.queries,
      libraryPath: this.editorState.libraryPath,
      text: this.editorState.editor.document.getText()
    } as MoveBlockArgs);

    if (moveBlockResponse === undefined) {
      console.log("failed to move block");
      return;
    }

    const newBlocks = await core.getBlocks(this.editorState.codeBlocksCliPath, {
      languageFnSymbol: languageSupport.parserInstaller.languageFnSymbol,
      queries: languageSupport.queries,
      libraryPath: this.editorState.libraryPath,
      text: moveBlockResponse.text
    });

    if (newBlocks === undefined) {
      console.log("failed to get blocks");
      return undefined;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.editorState.editor.document.uri, new vscode.Range(0, 0, this.editorState.editor.document.lineCount, 0), moveBlockResponse.text);

    await vscode.workspace.applyEdit(edit);

    const newOffset = direction === "down" ? moveBlockResponse.newSrcStart : moveBlockResponse.newDstStart;

    const newPosition = this.editorState.editor.document.positionAt(newOffset + cursorSelectedBlockOffset);
    const newSelection = new vscode.Selection(newPosition, newPosition);
    this.editorState.editor.selection = newSelection;

    this.updateSelection();
  }

  async toggle(): Promise<void> {
    const onActiveContentChanged = async (): Promise<void> => {
      await this.syncStateWithActiveEditor();
      return await this.updateBlocks();
    };
    const onSelectionChanged = (): void => this.updateSelection();

    if (!this.enabled) {
      this.enabled = true;
      this.disposables = [
        vscode.workspace.onDidChangeTextDocument(onActiveContentChanged),
        vscode.workspace.onDidSaveTextDocument(onActiveContentChanged),
        vscode.workspace.onDidOpenTextDocument(onActiveContentChanged),
        vscode.window.onDidChangeActiveTextEditor(onActiveContentChanged),
        vscode.window.onDidChangeTextEditorSelection(onSelectionChanged),
      ];
    } else {
      this.enabled = false;
      this.disposables?.map(async d => { await d.dispose(); });
    }

    if (this.enabled) {
      await onActiveContentChanged();
      onSelectionChanged();
    }
  }

  async raceGuard(promise: () => Promise<void>): Promise<void> {
    if (this.runningLock) {
      return;
    }

    this.runningLock = true;
    try {
      await promise();
    }

    finally {
      this.runningLock = false;
    }
  }

}


class EditorState {
  blocks: BlockLocationTree[] | undefined = undefined;
  selectedBlock: BlockLocation | undefined = undefined;
  selectedBlockSiblings: [BlockLocation | undefined, BlockLocation | undefined] = [undefined, undefined];

  editor: vscode.TextEditor;
  codeBlocksCliPath: string;
  parsersDir: string;
  languageSupport: core.LanguageSupport;
  libraryPath: string;

  public static async build(
    editor: vscode.TextEditor | undefined,
    codeBlocksCliPath: string,
    parsersDir: string
  ): Promise<EditorState | undefined> {
    if (editor === undefined) {
      return undefined;
    }

    const languageSupport = core.getLanguageSupport(editor.document.languageId);
    if (languageSupport === undefined) {
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
      return undefined;
    }

    return new EditorState(editor, codeBlocksCliPath, parsersDir, languageSupport, libraryPath);
  }

  constructor(
    editor: vscode.TextEditor,
    codeBlocksCliPath: string,
    parsersDir: string,
    languageSupport: core.LanguageSupport,
    libraryPath: string,
  ) {
    this.editor = editor;
    this.codeBlocksCliPath = codeBlocksCliPath;
    this.parsersDir = parsersDir;
    this.languageSupport = languageSupport;
    this.libraryPath = libraryPath;
  }

}

function clearDecorations(editor: vscode.TextEditor | undefined): void {
  editor?.setDecorations(selectedDecoration, []);
  editor?.setDecorations(targetsDecoration, []);
}

function highlightSelections(
  editor: vscode.TextEditor,
  selected: BlockLocation | undefined,
  siblings: [BlockLocation | undefined, BlockLocation | undefined]
): void {
  const [prev, next] = siblings;

  if (selected !== undefined) {
    const range = new vscode.Range(selected.startRow, selected.startCol, selected.endRow, selected.endCol);
    editor.setDecorations(selectedDecoration, [range]);
  } else {
    editor.setDecorations(selectedDecoration, []);
  }

  const targetRanges = [];
  if (prev !== undefined) {
    targetRanges.push(new vscode.Range(prev.startRow, prev.startCol, prev.endRow, prev.endCol));
  }

  if (next !== undefined) {
    targetRanges.push(new vscode.Range(next.startRow, next.startCol, next.endRow, next.endCol));
  }

  editor.setDecorations(targetsDecoration, targetRanges);
}

export async function getBlockModeHooks(context: vscode.ExtensionContext): Promise<Map<string, () => Promise<void>>> {
  const blockMode = await BlockModeExtension.getInstance(context);

  const guarded = (foo: () => Promise<void>) => async (): Promise<void> => await blockMode?.raceGuard(() => foo());

  const toggleHook = guarded(async () => blockMode?.toggle());
  const moveHook = (direction: "up" | "down", force: boolean): () => Promise<void> => {
    return guarded(async (): Promise<void> => blockMode?.moveSelectedBlock(direction, force));
  };

  const hooks = new Map<string, () => Promise<void>>();
  hooks.set("toggle", toggleHook);
  hooks.set("moveUp", moveHook("up", false));
  hooks.set("moveDown", moveHook("down", false));
  hooks.set("moveUpForce", moveHook("up", true));
  hooks.set("moveDownForce", moveHook("down", true));

  return hooks;
}
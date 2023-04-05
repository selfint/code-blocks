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

class EditorCoreWrapper {
  private codeBlocksCliPath: string;
  private languageSupport: core.LanguageSupport;
  private libraryPath: string;

  public static async build(
    editor: vscode.TextEditor | undefined,
    codeBlocksCliPath: string,
    parsersDir: string
  ): Promise<EditorCoreWrapper | undefined> {
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
      languageFnSymbol: this.languageSupport.parserInstaller.languageFnSymbol,
      queries: this.languageSupport.queries,
      text,
      libraryPath: this.libraryPath,
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
      srcBlock,
      dstBlock,
      force,
      languageFnSymbol: this.languageSupport.parserInstaller.languageFnSymbol,
      queries: this.languageSupport.queries,
      libraryPath: this.libraryPath,
      text
    };

    return await core.moveBlock(this.codeBlocksCliPath, args);
  }
}


class BlockModeExtension {
  /**
   * This is used to ensure that events only trigger one action.
   */
  private runningLock = false;

  private editorCoreWrapper: EditorCoreWrapper | undefined;
  private enabled = false;
  private parsersDir: string;
  private codeBlocksCliPath: string;

  private activeEditor: vscode.TextEditor | undefined = undefined;
  private blocks: BlockLocationTree[] | undefined = undefined;
  private selectedBlock: BlockLocation | undefined = undefined;
  private selectedBlockSiblings: [BlockLocation | undefined, BlockLocation | undefined] = [undefined, undefined];

  private disposables: vscode.Disposable[];

  private static instance: BlockModeExtension | undefined = undefined;

  private constructor(codeBlocksCliPath: string, parsersDir: string) {
    this.codeBlocksCliPath = codeBlocksCliPath;
    this.parsersDir = parsersDir;
    this.disposables = [];
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

  public isEnabled(): boolean {
    return this.enabled;
  }

  async syncWrapperWithActiveEditor(): Promise<EditorCoreWrapper | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (this.activeEditor === editor) {
      return this.editorCoreWrapper;
    } else {
      clearDecorations(this.activeEditor);
      this.activeEditor = editor;
      this.editorCoreWrapper = await EditorCoreWrapper.build(editor, this.codeBlocksCliPath, this.parsersDir);
      this.blocks = undefined;
      this.selectedBlock = undefined;
      this.selectedBlockSiblings = [undefined, undefined];
    }
  }

  async updateBlocks(): Promise<void> {
    if (this.activeEditor === undefined || this.editorCoreWrapper === undefined) {
      return;
    }

    this.blocks = await this.editorCoreWrapper.getBlocks(this.activeEditor.document.getText());
    this.updateSelection();
  }

  updateSelection(): void {
    if (this.activeEditor === undefined || this.blocks === undefined) {
      return;
    }

    const cursor = this.activeEditor.selection.active;

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

    const [prev, selected, next] = findTreesSelections(this.blocks);

    this.selectedBlock = selected;
    this.selectedBlockSiblings = [prev, next];

    highlightSelections(this.activeEditor, this.selectedBlock, this.selectedBlockSiblings);
  }

  async moveSelectedBlock(direction: "up" | "down", force: boolean): Promise<void> {
    if (this.activeEditor === undefined || this.editorCoreWrapper === undefined || this.selectedBlock === undefined) {
      return;
    }

    let srcBlock: BlockLocation | undefined = undefined;
    let dstBlock: BlockLocation | undefined = undefined;

    const [prev, next] = this.selectedBlockSiblings;

    switch (direction) {
      case "up":
        srcBlock = prev;
        dstBlock = this.selectedBlock;
        break;

      case "down":
        srcBlock = this.selectedBlock;
        dstBlock = next;
        break;
    }

    if (srcBlock === undefined || dstBlock === undefined) {
      console.log("missing target block");
      return;
    }

    const cursorByte = this.activeEditor.document.offsetAt(this.activeEditor.selection.active);
    const cursorSelectedBlockOffset = cursorByte - this.selectedBlock.startByte;

    const moveBlockResponse = await this.editorCoreWrapper.moveBlock(
      this.activeEditor.document.getText(),
      srcBlock,
      dstBlock,
      force
    );

    if (moveBlockResponse === undefined) {
      console.log("failed to move block");
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.activeEditor.document.uri, new vscode.Range(0, 0, this.activeEditor.document.lineCount, 0), moveBlockResponse.text);

    await vscode.workspace.applyEdit(edit);

    const newOffset = direction === "down" ? moveBlockResponse.newSrcStart : moveBlockResponse.newDstStart;

    const newPosition = this.activeEditor.document.positionAt(newOffset + cursorSelectedBlockOffset);
    const newSelection = new vscode.Selection(newPosition, newPosition);
    this.activeEditor.selection = newSelection;

    this.updateSelection();
  }

  async enable(): Promise<void> {
    this.enabled = true;

    const onActiveContentChanged = async (): Promise<void> => {
      await this.syncWrapperWithActiveEditor();
      return await this.updateBlocks();
    };
    const onSelectionChanged = (): void => this.updateSelection();
    this.disposables = [
      vscode.workspace.onDidChangeTextDocument(onActiveContentChanged),
      vscode.workspace.onDidSaveTextDocument(onActiveContentChanged),
      vscode.workspace.onDidOpenTextDocument(onActiveContentChanged),
      vscode.window.onDidChangeActiveTextEditor(onActiveContentChanged),
      vscode.window.onDidChangeTextEditorSelection(onSelectionChanged),
    ];

    await onActiveContentChanged();
    onSelectionChanged();
  }

  async disable(): Promise<void> {
    this.enabled = false;

    await Promise.all(this.disposables.map(async d => { await d.dispose(); }));
    this.disposables = [];

    clearDecorations(this.activeEditor);
  }

  async toggle(): Promise<void> {
    this.enabled ? await this.disable() : await this.enable();
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
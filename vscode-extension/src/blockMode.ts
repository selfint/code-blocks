import * as core from "./core";
import * as vscode from "vscode";
import { BlockLocation, BlockLocationTree, GetSubtreesArgs, MoveBlockArgs } from "./codeBlocksWrapper/types";
import { getCodeBlocksCliPath } from "./core";
import { join } from "path";

const decoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: "var(--vscode-editor-selectionBackground)",
});
const decoration1 = vscode.window.createTextEditorDecorationType({
  backgroundColor: "var(--vscode-editor-selectionHighlightBackground)",
});
const decoration2 = vscode.window.createTextEditorDecorationType({
  backgroundColor: "var(--vscode-editor-selectionHighlightBackground)",
});

let enabled = false;
let disposables: vscode.Disposable[] | undefined = undefined;
let blocks: BlockLocationTree[] | undefined = undefined;
let selectedBlock: BlockLocation | undefined = undefined;
let selectedBlockSiblings: [BlockLocation | undefined, BlockLocation | undefined] = [undefined, undefined];

/**
 * This is used to ensure that events only trigger one action.
 */
let runningLock = false;

async function updateBlocks(codeBlocksCliPath: string, parsersDir: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    return undefined;
  }

  const textDocument = editor.document;
  const languageId = textDocument.languageId;
  const languageSupport = core.getLanguageSupport(languageId);
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

  blocks = newBlocks;
  updateSelection();
}

function updateSelection(): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    return undefined;
  }

  if (blocks === undefined) {
    return undefined;
  }

  const cursor = editor.selection.active;

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

  const [prev, selected, next] = findTreesSelections(blocks);

  selectedBlock = selected;
  selectedBlockSiblings = [prev, next];

  highlightSelections();
}

function highlightSelections(): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    return;
  }

  const selected = selectedBlock;
  const [prev, next] = selectedBlockSiblings;

  if (selected !== undefined) {
    const range = new vscode.Range(selected.startRow, selected.startCol, selected.endRow, selected.endCol);
    editor.setDecorations(decoration, [range]);
  } else {
    editor.setDecorations(decoration, []);
  }

  if (prev !== undefined) {
    editor.setDecorations(decoration1, [new vscode.Range(prev.startRow, prev.startCol, prev.endRow, prev.endCol)]);
  } else {
    editor.setDecorations(decoration1, []);
  }

  if (next !== undefined) {
    editor.setDecorations(decoration2, [new vscode.Range(next.startRow, next.startCol, next.endRow, next.endCol)]);
  } else {
    editor.setDecorations(decoration2, []);
  }

}

async function moveSelectedBlock(codeBlocksCliPath: string | undefined, parsersDir: string, direction: "up" | "down", force: boolean): Promise<void> {
  if (codeBlocksCliPath === undefined) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    return undefined;
  }

  if (blocks === undefined) {
    return undefined;
  }

  if (selectedBlock === undefined) {
    return undefined;
  }

  const textDocument = editor.document;
  const languageId = textDocument.languageId;
  const languageSupport = core.getLanguageSupport(languageId);
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

  let srcBlock: BlockLocation | undefined = undefined;
  let dstBlock: BlockLocation | undefined = undefined;

  const [prev, next] = selectedBlockSiblings;

  switch (direction) {
    case "up":
      srcBlock = prev;
      dstBlock = selectedBlock;
      break;

    case "down":
      srcBlock = selectedBlock;
      dstBlock = next;
      break;
  }

  if (srcBlock === undefined || dstBlock === undefined) {
    console.log("missing target block");
    return;
  }

  const cursorByte = editor.document.offsetAt(editor.selection.active);
  const cursorSelectedBlockOffset = cursorByte - selectedBlock.startByte;

  const moveBlockResponse = await core.moveBlock(codeBlocksCliPath, editor.document, {
    srcBlock,
    dstBlock,
    force,
    languageFnSymbol: languageSupport.parserInstaller.languageFnSymbol,
    queries: languageSupport.queries,
    libraryPath,
    text: editor.document.getText()
  } as MoveBlockArgs);

  if (moveBlockResponse === undefined) {
    console.log("failed to move block");
    return;
  }

  const newBlocks = await core.getBlocks(codeBlocksCliPath, {
    languageFnSymbol: languageSupport.parserInstaller.languageFnSymbol,
    queries: languageSupport.queries,
    libraryPath,
    text: moveBlockResponse.text
  });

  if (newBlocks === undefined) {
    console.log("failed to get blocks");
    return undefined;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(editor.document.uri, new vscode.Range(0, 0, editor.document.lineCount, 0), moveBlockResponse.text);

  await vscode.workspace.applyEdit(edit);

  const newOffset = direction === "down" ? moveBlockResponse.newSrcStart : moveBlockResponse.newDstStart;

  const newPosition = editor.document.positionAt(newOffset + cursorSelectedBlockOffset);
  const newSelection = new vscode.Selection(newPosition, newPosition);
  editor.selection = newSelection;

  updateSelection();
}


async function toggle(codeBlocksCliPath: string | undefined, parsersDir: string): Promise<void> {
  if (codeBlocksCliPath === undefined) {
    return;
  }

  const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
    [key: string]: unknown;
    uri: vscode.Uri | undefined;
  };

  const doUpdateBlocks = async (): Promise<void> => await updateBlocks(codeBlocksCliPath, parsersDir);
  const doUpdateSelectedBlock = (): void => updateSelection();

  if (!enabled) {
    disposables = [
      vscode.workspace.onDidChangeTextDocument(doUpdateBlocks),
      vscode.workspace.onDidSaveTextDocument(doUpdateBlocks),
      vscode.workspace.onDidOpenTextDocument(doUpdateBlocks),
      vscode.window.onDidChangeActiveTextEditor(doUpdateBlocks),
      vscode.window.onDidChangeTextEditorSelection(doUpdateSelectedBlock),
    ];
    enabled = true;
  } else if (disposables !== undefined) {
    disposables.map(async (d) => { await d.dispose(); });
    vscode.window.activeTextEditor?.setDecorations(decoration, []);
    vscode.window.activeTextEditor?.setDecorations(decoration1, []);
    vscode.window.activeTextEditor?.setDecorations(decoration2, []);
    enabled = false;
  } else {
    throw new Error("Illegal state");
  }

  if (activeTabInput.uri !== undefined && enabled) {
    await doUpdateBlocks();
    doUpdateSelectedBlock();
  }
}

async function raceGuard(promise: () => Promise<void>): Promise<void> {
  if (runningLock) {
    return;
  }

  runningLock = true;
  try {
    await promise();
  }

  finally {
    runningLock = false;
  }

}

export function getBlockModeHooks(context: vscode.ExtensionContext): Map<string, () => Promise<void>> {
  const binDir = join(context.extensionPath, "bin");
  const parsersDir = join(context.extensionPath, "parsers");

  const guarded = (foo: () => Promise<void>) => async (): Promise<void> => await raceGuard(() => foo());
  const toggleHook = guarded(async () => toggle(await getCodeBlocksCliPath(binDir), parsersDir));
  const moveHook = (direction: "up" | "down", force: boolean): () => Promise<void> => {
    return guarded(async (): Promise<void> => moveSelectedBlock(await getCodeBlocksCliPath(binDir), parsersDir, direction, force));
  };

  const hooks = new Map<string, () => Promise<void>>();
  hooks.set("toggle", toggleHook);
  hooks.set("moveUp", moveHook("up", false));
  hooks.set("moveDown", moveHook("down", false));
  hooks.set("moveUpForce", moveHook("up", true));
  hooks.set("moveDownForce", moveHook("down", true));

  return hooks;
}
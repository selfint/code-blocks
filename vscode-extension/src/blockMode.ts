import * as core from "./core";
import * as vscode from "vscode";
import { BlockLocation, BlockLocationTree, GetSubtreesArgs, MoveBlockArgs } from "./codeBlocksWrapper/types";
import { join } from "path";

const decoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: "var(--vscode-editor-selectionBackground)",
});

let enabled = false;
let disposables: vscode.Disposable[] | undefined = undefined;
let blocks: BlockLocationTree[] | undefined = undefined;
let selectedBlock: BlockLocation | undefined = undefined;
let selectedBlockSiblings: [BlockLocation | undefined, BlockLocation | undefined] = [undefined, undefined];

async function updateBlocks(binDir: string, parsersDir: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  console.log(`editor: ${JSON.stringify(editor === undefined)}`);
  if (editor === undefined) {
    return undefined;
  }

  const textDocument = editor.document;
  const languageId = textDocument.languageId;
  const languageSupport = core.getLanguageSupport(languageId);
  if (languageSupport === undefined) {
    return undefined;
  }

  const libraryPath = await core.installLanguage(
    binDir,
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

  const newBlocks = await core.getBlocks(binDir, args);
  if (newBlocks === undefined) {
    console.log("failed to get blocks");
    return undefined;
  }

  if (newBlocks.length === 0) {
    console.log("got no blocks");
    return undefined;
  }

  blocks = newBlocks;
}

function updateSelection(): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    return undefined;
  }

  if (blocks === undefined) {
    return undefined;
  }

  const cursorStart = editor.selection.start;
  const cursorEnd = editor.selection.end;

  function cursorInBlock(block: BlockLocation): boolean {
    return (
      block.startRow <= cursorStart.line
      && block.startCol <= cursorStart.character
      && cursorEnd.line <= block.endRow
      && cursorEnd.character <= block.endCol
    );
  }

  function findSelectedBlockAndSiblings(trees: BlockLocationTree[]): [BlockLocation | undefined, BlockLocation | undefined, BlockLocation | undefined] {
    for (const tree of trees) {
      if (!cursorInBlock(tree.block)) {
        continue;
      }

      if (tree.children.length !== 0) {
        for (let j = 0; j < tree.children.length; j++) {
          const childTree = tree.children[j];
          if (!cursorInBlock(childTree.block)) {
            continue;
          }

          let [prev, selected, next] = findSelectedBlockAndSiblings(childTree.children);

          if (selected === undefined) {
            selected = childTree.block;
          } else {
            if (prev === undefined) {
              if (j === 0) {
                prev = childTree.block;
              } else {
                prev = childTree.children[j - 1].block;
              }
            }

            if (next === undefined) {
              if (j === childTree.children.length - 1) {
                next = childTree.block;
              } else {
                next = childTree.children[j + 1].block;
              }
            }
          }

          return [prev, selected, next];
        }
      }

      return [undefined, tree.block, undefined];
    }

    return [undefined, undefined, undefined];
  }

  const [prev, selected, next] = findSelectedBlockAndSiblings(blocks);
  if (selected !== undefined) {
    const range = new vscode.Range(selected.startRow, selected.startCol, selected.endRow, selected.endCol);
    editor.setDecorations(decoration, [range]);
  } else {
    editor.setDecorations(decoration, []);
  }

  selectedBlock = selected;
  selectedBlockSiblings = [prev, next];
}

async function moveSelectedBlock(binDir: string, parsersDir: string, direction: "up" | "down", force: boolean): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  console.log(`editor: ${JSON.stringify(editor === undefined)}`);
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

  const libraryPath = await core.installLanguage(
    binDir,
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

  const cursorByte = editor.document.offsetAt(editor.selection.start);
  const cursorSrcBlockOffset = cursorByte - srcBlock.startByte;

  const newSrcOffset = await core.moveBlock(binDir, editor.document, {
    srcBlock,
    dstBlock,
    force,
    languageFnSymbol: languageSupport.parserInstaller.languageFnSymbol,
    queries: languageSupport.queries,
    libraryPath,
    text: editor.document.getText()
  } as MoveBlockArgs);

  const newBlocks = await core.getBlocks(binDir, {
    languageFnSymbol: languageSupport.parserInstaller.languageFnSymbol,
    queries: languageSupport.queries,
    libraryPath,
    text: textDocument.getText()
  });

  if (newSrcOffset === undefined) {
    console.log("failed to get new src offset");
  } else {
    const newPosition = editor.document.positionAt(newSrcOffset + cursorSrcBlockOffset);
    const newSelection = new vscode.Selection(newPosition, newPosition);
    editor.selection = newSelection;
  }

  if (newBlocks === undefined) {
    console.log("failed to get blocks");
    return undefined;
  }
}


async function toggle(binDir: string, parsersDir: string): Promise<void> {
  const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
    [key: string]: unknown;
    uri: vscode.Uri | undefined;
  };

  const doUpdateBlocks = async (): Promise<void> => await updateBlocks(binDir, parsersDir);
  const doUpdateSelectedBlock = (): void => updateSelection();

  if (!enabled) {
    disposables = [
      vscode.workspace.onDidChangeTextDocument(doUpdateBlocks),
      vscode.window.onDidChangeActiveTextEditor(doUpdateBlocks),
      vscode.window.onDidChangeTextEditorSelection(doUpdateSelectedBlock),
    ];
    enabled = true;
  } else if (disposables !== undefined) {
    disposables.map(async (d) => { await d.dispose(); });
    enabled = false;
  } else {
    throw new Error("Illegal state");
  }

  if (activeTabInput.uri !== undefined && enabled) {
    await doUpdateBlocks();
    doUpdateSelectedBlock();
  }
}

export function getBlockModeHooks(context: vscode.ExtensionContext): Map<string, () => Promise<void>> {
  const binDir = join(context.extensionPath, "bin");
  const parsersDir = join(context.extensionPath, "parsers");

  const hooks = new Map<string, () => Promise<void>>();
  hooks.set("toggle", async (): Promise<void> => await toggle(binDir, parsersDir));
  hooks.set("moveUp", async (): Promise<void> => await moveSelectedBlock(binDir, parsersDir, "up", false));
  hooks.set("moveDown", async (): Promise<void> => await moveSelectedBlock(binDir, parsersDir, "down", false));
  hooks.set("moveUpForce", async (): Promise<void> => await moveSelectedBlock(binDir, parsersDir, "up", true));
  hooks.set("moveDownForce", async (): Promise<void> => await moveSelectedBlock(binDir, parsersDir, "down", true));

  return hooks;
}
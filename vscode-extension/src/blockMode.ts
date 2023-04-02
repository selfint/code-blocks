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

function updateSelectedBlock(): void {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    return undefined;
  }

  if (blocks === undefined) {
    return undefined;
  }

  const cursorStart = editor.selection.start;
  const cursorEnd = editor.selection.end;

  function walkTree(tree: BlockLocationTree): BlockLocation | undefined {
    if (
      tree.block.startRow <= cursorStart.line
      && tree.block.startCol <= cursorStart.character
      && cursorEnd.line <= tree.block.endRow
      && cursorEnd.character <= tree.block.endCol
    ) {
      for (const childTree of tree.children) {
        const innerBlock = walkTree(childTree);
        if (innerBlock !== undefined) {
          return innerBlock;
        }
      }

      return tree.block;
    } else {
      return undefined;
    }
  }

  for (const tree of blocks) {
    const isSelected = walkTree(tree);
    if (isSelected !== undefined) {
      const block = isSelected;
      selectedBlock = block;
      const range = new vscode.Range(block.startRow, block.startCol, block.endRow, block.endCol);
      editor.setDecorations(decoration, [range]);
      return;
    }
  }

  editor.setDecorations(decoration, []);
  selectedBlock = undefined;
}

async function moveSelectedBlock(binDir: string, parsersDir: string, direction: "up" | "down"): Promise<void> {
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


  function findSiblings(trees: BlockLocationTree[]): [BlockLocation | undefined, BlockLocation | undefined] | undefined {
    let prev = undefined;
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i];
      let next = undefined;
      if (i < trees.length - 1) {
        next = trees[i + 1].block;
      }

      if (tree.block === selectedBlock) {
        return [prev, next];
      }

      prev = tree.block;
    }

    for (const tree of trees) {
      const found = findSiblings(tree.children);
      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  const siblings = findSiblings(blocks);
  if (siblings === undefined) {
    console.log("no siblings");
    return;
  }

  const [prev, next] = siblings;

  let srcBlock: BlockLocation | undefined = undefined;
  let dstBlock: BlockLocation | undefined = undefined;

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

  await core.moveBlock(binDir, editor.document, {
    srcBlock,
    dstBlock,
    force: false,
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
  const doUpdateSelectedBlock = (): void => updateSelectedBlock();

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

export function getBlockModeHooks(context: vscode.ExtensionContext): [
  () => Promise<void>,
  () => Promise<void>,
  () => Promise<void>
] {
  const binDir = join(context.extensionPath, "bin");
  const parsersDir = join(context.extensionPath, "parsers");

  return [
    async (): Promise<void> => await toggle(binDir, parsersDir),
    async (): Promise<void> => await moveSelectedBlock(binDir, parsersDir, "up"),
    async (): Promise<void> => await moveSelectedBlock(binDir, parsersDir, "down")
  ];
}
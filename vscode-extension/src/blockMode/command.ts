import * as core from "./newCore";
import * as vscode from "vscode";
import { join } from "path";
import { BlockLocation, BlockLocationTree } from "../codeBlocks/types";


async function showBlocks(binDir: string, parsersDir: string): Promise<void> {
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
    {
      installDir: join(parsersDir, languageSupport.parserInstaller.libraryName),
      ...languageSupport.parserInstaller,
    },
    binDir
  );
  if (libraryPath === undefined) {
    return undefined;
  }

  const text = textDocument.getText();
  const blocks = await core.getBlocks(text, languageId, languageSupport, libraryPath);
  if (blocks === undefined) {
    console.log("failed to get blocks");
    return undefined;
  }

  if (blocks.length === 0) {
    console.log("got no blocks");
    return undefined;
  }

  const decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: "var(--vscode-editor-selectionBackground)",
  });

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
      const range = new vscode.Range(block.startRow, block.startCol, block.endRow, block.endCol);
      editor.setDecorations(decoration, [range]);
      break;
    }
  }
}


export function toggleBlockMode(context: vscode.ExtensionContext): () => Promise<void> {
  let enabled = false;
  let disposables: [vscode.Disposable, vscode.Disposable] | undefined = undefined;

  return async () => {
    const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
      [key: string]: unknown;
      uri: vscode.Uri | undefined;
    };

    const binDir = join(context.extensionPath, "bin");
    const parsersDir = join(context.extensionPath, "parsers");
    const callback = async (): Promise<void> => await showBlocks(binDir, parsersDir);

    if (!enabled) {
      disposables = [
        vscode.workspace.onDidChangeTextDocument(callback),
        vscode.window.onDidChangeActiveTextEditor(callback)
      ];
      enabled = true;
    } else if (disposables !== undefined) {
      const [d0, d1] = disposables;
      await d0.dispose();
      await d1.dispose();
      enabled = false;
    } else {
      throw new Error("Illegal state");
    }

    if (activeTabInput.uri !== undefined && enabled) {
      await callback();
    }
  };
}
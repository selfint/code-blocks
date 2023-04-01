import * as core from "./newCore";
import * as vscode from "vscode";
import { join } from "path";


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

  const smallNumberDecorationType = vscode.window.createTextEditorDecorationType({
    borderWidth: '1px',
    borderStyle: 'solid',
    overviewRulerColor: 'blue',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    light: {
      borderColor: 'darkblue'
    },
    dark: {
      borderColor: 'lightblue'
    }
  });

  await vscode.window.showInformationMessage(`Got blocks: ${JSON.stringify(blocks)}`);

  return;
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
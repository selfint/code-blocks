import * as core from "./newCore";
import * as vscode from "vscode";
import { join } from "path";


async function showBlocks(binDir: string, parsersDir: string, textDocument: vscode.TextDocument): Promise<void> {
  const languageId = textDocument.languageId;
  const languageSupport = core.getLanguageSupport(languageId);
  if (languageSupport === undefined) {
    return undefined;
  }

  const libraryPath = await core.installLanguage({
    ...languageSupport.parserInstaller,
    installDir: join(parsersDir, languageSupport.parserInstaller.libraryName),
  }, binDir);
  if (libraryPath === undefined) {
    return undefined;
  }

  const text = textDocument.getText();

  console.log("getting blocks");
  const blocks = await core.getBlocks(text, languageId, languageSupport, libraryPath);
  console.log("got blocks");

  await vscode.window.showInformationMessage(`Got blocks: ${JSON.stringify(blocks)}`);

  return;
}


export async function toggleBlockMode(context: vscode.ExtensionContext): Promise<void> {
  const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
    [key: string]: unknown;
    uri: vscode.Uri | undefined;
  };

  const binDir = join(context.extensionPath, "bin");
  const parsersDir = join(context.extensionPath, "parsers");

  vscode.workspace.onDidOpenTextDocument(
    async textDocument => await showBlocks(
      binDir,
      parsersDir,
      textDocument
    )
  );

  if (activeTabInput.uri !== undefined) {
    await showBlocks(
      binDir,
      parsersDir,
      await vscode.workspace.openTextDocument(activeTabInput.uri)
    );
  }
}
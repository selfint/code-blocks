import { ExtensionContext, Uri, commands, window } from "vscode";
import { CodeBlocksEditorProvider } from "./CodeBlocksEditorProvider";

function reopenWithCodeBocksEditor(): void {
  const activeTabInput = window.tabGroups.activeTabGroup.activeTab?.input as {
    [key: string]: any;
    uri: Uri | undefined;
  };

  if (activeTabInput.uri !== undefined) {
    commands.executeCommand("vscode.openWith", activeTabInput.uri, "codeBlocks.editor");
  }
}

function openCodeBlocksEditorToTheSide(): void {
  const activeTabInput = window.tabGroups.activeTabGroup.activeTab?.input as {
    [key: string]: any;
    uri: Uri | undefined;
  };

  if (activeTabInput.uri !== undefined) {
    commands.executeCommand("vscode.openWith", activeTabInput.uri, "codeBlocks.editor");
    commands.executeCommand("workbench.action.moveEditorToNextGroup");
  }
}

export function activate(context: ExtensionContext): void {
  context.subscriptions.push(
    window.registerCustomEditorProvider(
      CodeBlocksEditorProvider.viewType,
      new CodeBlocksEditorProvider(context)
    )
  );

  context.subscriptions.push(commands.registerCommand("codeBlocks.open", reopenWithCodeBocksEditor));
  context.subscriptions.push(
    commands.registerCommand("codeBlocks.openToTheSide", openCodeBlocksEditorToTheSide)
  );
}

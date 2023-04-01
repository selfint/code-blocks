import * as vscode from "vscode";


export async function toggleBlockMode(): Promise<void> {
  const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
    [key: string]: unknown;
    uri: vscode.Uri | undefined;
  };

  if (activeTabInput.uri !== undefined) {
    await vscode.window.showInformationMessage(activeTabInput.uri.toString());
  }
}
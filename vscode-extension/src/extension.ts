import { ExtensionContext, Uri, commands, window } from "vscode";
import { CodeBlocksEditorProvider } from "./editor/CodeBlocksEditorProvider";
import { getBlockModeHooks } from "./blockMode";

async function reopenWithCodeBocksEditor(): Promise<void> {
  const activeTabInput = window.tabGroups.activeTabGroup.activeTab?.input as {
    [key: string]: unknown;
    uri: Uri | undefined;
  };

  if (activeTabInput.uri !== undefined) {
    await commands.executeCommand("vscode.openWith", activeTabInput.uri, "codeBlocks.editor");
  }
}

async function openCodeBlocksEditorToTheSide(): Promise<void> {
  const activeTabInput = window.tabGroups.activeTabGroup.activeTab?.input as {
    [key: string]: unknown;
    uri: Uri | undefined;
  };

  if (activeTabInput.uri !== undefined) {
    await commands.executeCommand("vscode.openWith", activeTabInput.uri, "codeBlocks.editor");
    await commands.executeCommand("workbench.action.moveEditorToNextGroup");
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
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

  const hooks = await getBlockModeHooks(context);
  for (const [hookName, hook] of hooks) {
    context.subscriptions.push(commands.registerCommand(`codeBlocks.${hookName}`, hook));
  }
}

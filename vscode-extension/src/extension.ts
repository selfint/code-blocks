import { ExtensionContext, window } from "vscode";
import { CodeBlocksEditorProvider } from "./CodeBlocksEditorProvider";

export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    window.registerCustomEditorProvider(
      CodeBlocksEditorProvider.viewType,
      new CodeBlocksEditorProvider(context)
    )
  );
}

import { ExtensionContext } from "vscode";
import { CodeBlocksEditorProvider } from "./CodeBlocksEditorProvider";

export function activate(context: ExtensionContext) {
  context.subscriptions.push(CodeBlocksEditorProvider.register(context));
}

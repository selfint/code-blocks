import { commands, ExtensionContext } from "vscode";
import { HelloWorldPanel } from "./panels/HelloWorldPanel";
import { CatScratchEditorProvider } from "./CatScratchEditorProvider";
import { ShuffleEditorProvider } from "./ShuffleEditorProvider";

export function activate(context: ExtensionContext) {
  // Create the show hello world command
  const showHelloWorldCommand = commands.registerCommand("hello-world.showHelloWorld", () => {
    HelloWorldPanel.render(context.extensionUri);
  });

  // Add command to the extension context
  context.subscriptions.push(showHelloWorldCommand);

  context.subscriptions.push(CatScratchEditorProvider.register(context));
  context.subscriptions.push(ShuffleEditorProvider.register(context));
}

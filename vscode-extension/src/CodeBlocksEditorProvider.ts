import * as vscode from "vscode";
import { getNonce } from "./utilities/getNonce";
import { getUri } from "./utilities/getUri";
import { CodeBlocksServerRC, getBlockTrees, moveBlock } from "./codeBlocks/codeBlocks";
import { BlockLocation, MoveItemArgs } from "./codeBlocks/types";
import { getQueryStrings } from "./codeBlocks/queries";
import { SUPPORTED_LANGUAGES } from "./codeBlocks/types";

function getDocLang(document: vscode.TextDocument): string {
  let lang = document.languageId;

  if (lang === "typescriptreact") {
    lang = "tsx";
  }

  return lang;
}

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = "codeBlocks.editor";

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new CodeBlocksEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      CodeBlocksEditorProvider.viewType,
      provider
    );
    return providerRegistration;
  }

  /**
   * Called when our custom editor is opened.
   *
   *
   */
  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Start code-blocks-server
    CodeBlocksServerRC.startServer();

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    async function updateWebview() {
      const text = document.getText();
      const lang = getDocLang(document);

      // @ts-expect-error
      if (SUPPORTED_LANGUAGES.includes(lang)) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const blockTrees = await getBlockTrees({
          content: text,
          // @ts-expect-error
          items: getQueryStrings(lang),
          // @ts-expect-error
          language: getDocLang(document),
        });

        webviewPanel.webview.postMessage({
          type: "update",
          text: document.getText(),
          blockTrees: blockTrees,
        });
      } else {
        vscode.window.showErrorMessage(`Opened file in unsupported language: ${document.languageId}`);
        return;
      }
    }

    // Hook up event handlers so that we can synchronize the webview with the text document.
    //
    // The text document acts as our model, so we have to sync change in the document to our
    // editor and sync changes in the editor back to the document.
    //
    // Remember that a single text document can also be shared between multiple custom
    // editors (this happens for example when you split a custom editor)

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        await updateWebview();
      }
    });

    // Make sure we get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      CodeBlocksServerRC.stopServer();
    });

    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const newContent = event.document.getText();

      const blockTrees = await getBlockTrees({
        content: newContent,
        // @ts-expect-error
        items: getQueryStrings(getDocLang(document)),
        // @ts-expect-error
        language: getDocLang(document),
      });

      webviewPanel.webview.postMessage({
        type: "update",
        text: newContent,
        blockTrees: blockTrees,
      });
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: { command: string; args: any }) => {
      const command = message.command;
      const args = message.args;

      switch (command) {
        case "move":
          await this.handleMoveCommand(args, document);
          break;
      }
    }, undefined);

    await updateWebview();
  }

  private async handleMoveCommand(
    args: { src: BlockLocation; dst: BlockLocation },
    document: vscode.TextDocument
  ): Promise<void> {
    const moveArgs: MoveItemArgs = {
      content: document.getText(),
      // eslint-disable-next-line @typescript-eslint/naming-convention
      src_item: args.src,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      dst_item: args.dst,
      //@ts-expect-error
      // eslint-disable-next-line @typescript-eslint/naming-convention
      item_types: getQueryStrings(document.languageId),
      //@ts-expect-error
      language: getDocLang(document),
    };

    const response = await moveBlock(moveArgs);

    if (response.Err !== undefined) {
      vscode.window.showErrorMessage(`Failed to move block: ${response.Err}`);
    } else if (response.Ok !== undefined) {
      const newContent = response.Ok;

      const edit = new vscode.WorkspaceEdit();

      edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newContent);

      await vscode.workspace.applyEdit(edit);
    }
  }

  /**
   * Get the static html used for the editor webviews.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // The CSS file from the Svelte build output
    const stylesUri = getUri(webview, this.context.extensionUri, [
      "webview-ui",
      "public",
      "build",
      "bundle.css",
    ]);
    // The JS file from the Svelte build output
    const scriptUri = getUri(webview, this.context.extensionUri, [
      "webview-ui",
      "public",
      "build",
      "bundle.js",
    ]);

    const nonce = getNonce();

    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Hello World</title>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
          <link rel="stylesheet" type="text/css" href="${stylesUri}">
          <script defer nonce="${nonce}" src="${scriptUri}"></script>
        </head>
        <body>
        </body>
      </html>
    `;
  }
}

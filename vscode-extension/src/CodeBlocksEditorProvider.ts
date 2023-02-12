import * as vscode from "vscode";
import { getNonce } from "./utilities/getNonce";
import { getUri } from "./utilities/getUri";
import { CodeBlocksServerRC, getBlockTrees, moveBlock } from "./codeBlocks/codeBlocks";
import { BlockLocation, MoveItemArgs } from "./codeBlocks/types";
import { getQueryStrings } from "./codeBlocks/queries";
import { SUPPORTED_LANGUAGES } from "./codeBlocks/types";
import { MoveCommand, UpdateMessage } from "./types";

function getDocLang(document: vscode.TextDocument): string {
  let lang = document.languageId;

  if (lang === "typescriptreact") {
    lang = "tsx";
  }

  return lang;
}

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "codeBlocks.editor";

  constructor(private readonly context: vscode.ExtensionContext) {}

  async handleMessage(document: vscode.TextDocument, message: MoveCommand): Promise<void> {
    switch (message.command) {
      case "move":
        await this.handleMoveCommand(message.args, document);
        break;
    }
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    //@ts-expect-error
    if (!SUPPORTED_LANGUAGES.includes(getDocLang(document))) {
      vscode.window.showErrorMessage(`Opened file in unsupported language: ${document.languageId}`);
      return;
    }

    // Start code-blocks-server
    CodeBlocksServerRC.startServer();

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    this.subscribeToDocEvents(webviewPanel, document);

    await this.updateWebview(document, webviewPanel);
  }

  private subscribeToDocEvents(webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument) {
    const didReceiveMessageSubscription = webviewPanel.webview.onDidReceiveMessage(
      async (message: MoveCommand) => this.handleMessage(document, message),
      undefined
    );

    const didChangeTextDocumentSubscription = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        await this.updateWebview(e.document, webviewPanel);
      }
    });

    webviewPanel.onDidDispose(() => {
      didChangeTextDocumentSubscription.dispose();
      didReceiveMessageSubscription.dispose();
      CodeBlocksServerRC.stopServer();
    });
  }

  private async updateWebview(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel) {
    const content = document.getText();

    const blockTrees = await getBlockTrees({
      content: content,
      // @ts-expect-error
      items: getQueryStrings(getDocLang(document)),
      // @ts-expect-error
      language: getDocLang(document),
    });

    const updateMessage: UpdateMessage = {
      type: "update",
      text: content,
      blockTrees: blockTrees,
    };
    webviewPanel.webview.postMessage(updateMessage);
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

import * as vscode from "vscode";
import { getNonce } from "./utilities/getNonce";
import { getUri } from "./utilities/getUri";
import { getBlockTrees, moveBlock } from "./codeBlocks/codeBlocksCli";
import {
  BlockLocation,
  GetSubtreesArgs,
  GetSubtreesResponse,
  JsonResult,
  MoveBlockArgs,
  MoveBlockResponse,
} from "./codeBlocks/types";
import { getQueryStrings } from "./codeBlocks/queries";
import { SUPPORTED_LANGUAGES } from "./codeBlocks/types";
import { MoveCommand, UpdateMessage } from "./messages";
import { ensureInstalled } from "./codeBlocks/installer";

function getDocLang(document: vscode.TextDocument): string {
  let lang = document.languageId;

  if (lang === "typescriptreact") {
    lang = "tsx";
  }

  return lang;
}

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "codeBlocks.editor";

  private binPath: string | undefined = undefined;

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

    this.binPath = await ensureInstalled(this.context.extensionPath);
    if (this.binPath === undefined) {
      vscode.window.showErrorMessage("Server not installed");
      return;
    }

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
    });
  }

  private async updateWebview(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel) {
    const content = document.getText();

    let response: JsonResult<GetSubtreesResponse>;

    try {
      const getSubtreeArgs: GetSubtreesArgs = {
        text: content,
        // @ts-expect-error
        queries: getQueryStrings(getDocLang(document)),
        // @ts-expect-error
        language: getDocLang(document),
      };

      response = await getBlockTrees(this.binPath!, getSubtreeArgs);
    } catch (error) {
      vscode.window.showErrorMessage(JSON.stringify(error));
      return;
    }

    switch (response.status) {
      case "ok":
        webviewPanel.webview.postMessage({
          type: "update",
          text: content,
          blockTrees: response.result,
        } as UpdateMessage);
        break;

      case "error":
        vscode.window.showErrorMessage(`Failed to get blocks: ${response.result}`);
        break;
    }
  }

  private async handleMoveCommand(
    args: { src: BlockLocation; dst: BlockLocation },
    document: vscode.TextDocument
  ): Promise<void> {
    const moveArgs: MoveBlockArgs = {
      text: document.getText(),
      srcBlock: args.src,
      dstBlock: args.dst,
      //@ts-expect-error
      queries: getQueryStrings(document.languageId),
      //@ts-expect-error
      language: getDocLang(document),
    };

    let response: JsonResult<MoveBlockResponse>;

    try {
      response = await moveBlock(this.binPath!, moveArgs);
    } catch (error) {
      vscode.window.showErrorMessage(JSON.stringify(error));
      return;
    }

    switch (response.status) {
      case "ok":
        const newContent = response.result;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newContent);

        await vscode.workspace.applyEdit(edit);
        break;

      case "error":
        vscode.window.showErrorMessage(`Failed to move block: ${response.result}`);
        break;
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

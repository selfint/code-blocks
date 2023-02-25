import * as vscode from "vscode";
import { MoveCommand } from "./messages";
import * as core from "./core";
import { getUri } from "./utilities/getUri";
import { getNonce } from "./utilities/getNonce";
import { SupportedLanguage } from "./codeBlocks/types";

export class CodeBlocksEditor {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly document: vscode.TextDocument,
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly docLang: SupportedLanguage,
    private readonly codeBlocksCliPath: string
  ) {
    this.initWebview();
    this.subscribeToDocEvents();

    // first draw of ui triggered manually
    this.drawBlocks();
  }

  private async drawBlocks(): Promise<void> {
    await core.drawBlocks(this.codeBlocksCliPath, this.webviewPanel.webview, this.document, this.docLang);
  }

  private async moveBlock(message: MoveCommand): Promise<void> {
    await core.moveBlock(message, this.codeBlocksCliPath, this.document, this.docLang);
  }

  private initWebview(): void {
    const webview = this.webviewPanel.webview;
    const extensionUri = this.context.extensionUri;

    const stylesUri = getUri(webview, extensionUri, ["webview-ui", "public", "build", "bundle.css"]);
    const scriptUri = getUri(webview, extensionUri, ["webview-ui", "public", "build", "bundle.js"]);

    const nonce = getNonce();

    webview.options = {
      enableScripts: true,
    };

    webview.html = /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Code Blocks editor</title>
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

  private subscribeToDocEvents(): void {
    let disposables: vscode.Disposable[] = [];
    const webviewPanel = this.webviewPanel;

    // handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(
      async (message: MoveCommand) => this.moveBlock(message),
      undefined,
      disposables
    );

    // re-render ui when webview becomes visible again
    webviewPanel.onDidChangeViewState(
      async (e: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
        if (e.webviewPanel.visible) {
          await this.drawBlocks();
        }
      },
      undefined,
      disposables
    );

    // re-render ui when this document's text changes
    vscode.workspace.onDidChangeTextDocument(
      async (e: vscode.TextDocumentChangeEvent) => {
        if (e.document.uri.toString() === this.document.uri.toString()) {
          await this.drawBlocks();
        }
      },
      undefined,
      disposables
    );

    webviewPanel.onDidDispose(() => disposables.forEach((d) => d.dispose()));
  }
}

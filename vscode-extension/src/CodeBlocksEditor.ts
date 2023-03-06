import * as core from "./core";
import * as vscode from "vscode";
import { GetSubtreesArgs, MoveBlockArgs } from "./codeBlocks/types";
import { MoveCommand } from "./messages";
import { getNonce } from "./utilities/getNonce";
import { getUri } from "./utilities/getUri";

export class CodeBlocksEditor {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly document: vscode.TextDocument,
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly codeBlocksCliPath: string,
    private readonly queries: string[],
    private readonly libraryPath: string,
    private readonly languageFnSymbol: string
  ) {
    this.initWebview();
    this.subscribeToDocEvents();

    // first draw of ui triggered manually
    this.drawBlocks().catch((e) => {
      throw new Error(`Failed to draw blocks: ${JSON.stringify(e)}`);
    });
  }

  private async drawBlocks(): Promise<void> {
    const args: GetSubtreesArgs = {
      queries: this.queries,
      text: this.document.getText(),
      libraryPath: this.libraryPath,
      languageFnSymbol: this.languageFnSymbol,
    };
    await core.drawBlocks(this.codeBlocksCliPath, this.webviewPanel.webview, args);
  }

  private async moveBlock(message: MoveCommand): Promise<void> {
    const args: MoveBlockArgs = {
      queries: this.queries,
      text: this.document.getText(),
      libraryPath: this.libraryPath,
      languageFnSymbol: this.languageFnSymbol,
      srcBlock: message.args.src,
      dstBlock: message.args.dst,
      force: false,
    };

    await core.moveBlock(this.codeBlocksCliPath, this.document, args);
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
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
            webview.cspSource
          }; script-src 'nonce-${nonce}';">
          <link rel="stylesheet" type="text/css" href="${stylesUri.toString()}">
          <script defer nonce="${nonce}" src="${scriptUri.toString()}"></script>
        </head>
        <body>
        </body>
      </html>
    `;
  }

  private subscribeToDocEvents(): void {
    const disposables: vscode.Disposable[] = [];
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

    webviewPanel.onDidDispose(() =>
      disposables.forEach((d) => {
        d.dispose();
      })
    );
  }
}

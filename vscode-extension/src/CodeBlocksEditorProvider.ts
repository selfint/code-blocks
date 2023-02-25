import * as vscode from "vscode";
import * as path from "path";
import { getNonce } from "./utilities/getNonce";
import { getUri } from "./utilities/getUri";
import { SupportedLanguage } from "./codeBlocks/types";
import { MoveCommand } from "./messages";
import { getOrInstallCli } from "./codeBlocks/installer/installer";
import { moveBlock, updateUiBlocks } from "./uiBridge";

const vscodeLangIdToSupportedLanguage: Map<string, SupportedLanguage> = new Map([
  ["svelte", "svelte"],
  ["typescript", "typescript"],
  ["typescriptreact", "tsx"],
  ["rust", "rust"],
]);

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "codeBlocks.editor";
  public static readonly extensionBinDir = "bin";
  private extensionBinDirPath: string;

  private binPath: string | undefined = undefined;
  private docLang: SupportedLanguage | undefined = undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.extensionBinDirPath = path.join(context.extensionPath, CodeBlocksEditorProvider.extensionBinDir);
  }

  async handleMessage(document: vscode.TextDocument, message: MoveCommand): Promise<void> {
    await moveBlock(message, document, this.docLang!, this.binPath!);
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.docLang = vscodeLangIdToSupportedLanguage.get(document.languageId);
    if (this.docLang === undefined) {
      const langs = Array.from(vscodeLangIdToSupportedLanguage.keys());
      vscode.window.showErrorMessage(
        `Opened file in unsupported language: '${document.languageId}' (supported languages: ${langs})`
      );
      return;
    }

    this.binPath = await getOrInstallCli(this.extensionBinDirPath);
    if (this.binPath === undefined) {
      vscode.window.showErrorMessage("Server not installed");
      return;
    }

    this.initWebview(webviewPanel.webview);

    this.subscribeToDocEvents(webviewPanel, document);

    await updateUiBlocks(document, webviewPanel, this.docLang!, this.binPath!);
  }

  private initWebview(webview: vscode.Webview) {
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

  private subscribeToDocEvents(webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument) {
    const didReceiveMessageSubscription = webviewPanel.webview.onDidReceiveMessage(
      async (message: MoveCommand) => this.handleMessage(document, message),
      undefined
    );

    const didChangeTextDocumentSubscription = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        await updateUiBlocks(document, webviewPanel, this.docLang!, this.binPath!);
      }
    });

    webviewPanel.onDidDispose(() => {
      didChangeTextDocumentSubscription.dispose();
      didReceiveMessageSubscription.dispose();
    });
  }
}

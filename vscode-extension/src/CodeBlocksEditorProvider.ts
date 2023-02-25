import * as vscode from "vscode";
import * as path from "path";
import { SupportedLanguage } from "./codeBlocks/types";
import { MoveCommand } from "./messages";
import { getOrInstallCli } from "./codeBlocks/installer/installer";
import * as core from "./core";

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
    await core.moveBlock(message, document, this.docLang!, this.binPath!);
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

    core.initWebview(webviewPanel.webview, this.context.extensionUri);

    this.subscribeToDocEvents(webviewPanel, document);

    await core.updateUiBlocks(document, webviewPanel, this.docLang!, this.binPath!);
  }

  private subscribeToDocEvents(webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument): void {
    const didReceiveMessageSubscription = webviewPanel.webview.onDidReceiveMessage(
      async (message: MoveCommand) => this.handleMessage(document, message),
      undefined
    );

    const didChangeTextDocumentSubscription = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        await core.updateUiBlocks(document, webviewPanel, this.docLang!, this.binPath!);
      }
    });

    webviewPanel.onDidDispose(() => {
      didChangeTextDocumentSubscription.dispose();
      didReceiveMessageSubscription.dispose();
    });
  }
}

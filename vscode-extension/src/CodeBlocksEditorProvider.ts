import * as vscode from "vscode";
import * as path from "path";
import { SupportedLanguage } from "./codeBlocks/types";
import { getOrInstallCli } from "./codeBlocks/installer/installer";
import { CodeBlocksEditor } from "./CodeBlocksEditor";

const vscodeLangIdToSupportedLanguage: Map<string, SupportedLanguage> = new Map([
  ["svelte", "svelte"],
  ["typescript", "typescript"],
  ["typescriptreact", "tsx"],
  ["rust", "rust"],
  ["python", "python"],
]);

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "codeBlocks.editor";
  public static readonly extensionBinDir = "bin";
  private extensionBinDirPath: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.extensionBinDirPath = path.join(context.extensionPath, CodeBlocksEditorProvider.extensionBinDir);
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const docLang = vscodeLangIdToSupportedLanguage.get(document.languageId);
    if (docLang === undefined) {
      const langs = Array.from(vscodeLangIdToSupportedLanguage.keys());
      vscode.window.showErrorMessage(
        `Opened file in unsupported language: '${document.languageId}' (supported languages: ${langs})`
      );
      return;
    }

    const codeBlocksCliPath = await getOrInstallCli(this.extensionBinDirPath);
    if (codeBlocksCliPath === undefined) {
      vscode.window.showErrorMessage("Server not installed");
      return;
    }

    new CodeBlocksEditor(this.context, document, webviewPanel, docLang, codeBlocksCliPath);
  }
}

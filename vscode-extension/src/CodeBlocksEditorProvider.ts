import * as vscode from "vscode";
import * as path from "path";
import { promises as asyncFs } from "fs";
import { SupportedDynamicLanguage, SupportedLanguage } from "./codeBlocks/types";
import { getOrInstallCli } from "./codeBlocks/installer/installer";
import { CodeBlocksEditor } from "./CodeBlocksEditor";

const vscodeLangIdToSupportedLanguage: Map<string, SupportedLanguage> = new Map([
  ["svelte", "svelte"],
  ["typescript", "typescript"],
  // ["typescriptreact", "tsx"],
  ["rust", "rust"],
  ["python", "python"],
]);
const vscodeLangIdToSupportedDynamicLanguage: Map<string, SupportedDynamicLanguage> = new Map([
  ["svelte", "svelte"],
  ["typescript", "typescript"],
  ["typescriptreact", "tsx"],
  ["rust", "rust"],
  ["python", "python"],
]);

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "codeBlocks.editor";
  public static readonly extensionBinDir = "bin";
  public static readonly parsersDir = "parsers";
  private extensionBinDirPath: string;
  private extensionParsersDirPath: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.extensionBinDirPath = path.join(context.extensionPath, CodeBlocksEditorProvider.extensionBinDir);
    this.extensionParsersDirPath = path.join(context.extensionPath, CodeBlocksEditorProvider.parsersDir);
  }

  async getDocLang(document: vscode.TextDocument): Promise<SupportedLanguage | undefined> {
    const supportedLang = vscodeLangIdToSupportedLanguage.get(document.languageId);
    if (supportedLang !== undefined) {
      console.log(`using supported lang: ${supportedLang}`);
      return supportedLang;
    }

    const supportedDynamic = vscodeLangIdToSupportedDynamicLanguage.get(document.languageId);
    if (supportedDynamic !== undefined) {
      console.log(`using supported dynamic lang: ${supportedDynamic}`);
      const installDir = path.join(this.extensionParsersDirPath, supportedDynamic);
      await asyncFs.mkdir(installDir, { recursive: true });
      return {
        supportedDynamic: {
          language: supportedDynamic,
          installDir: installDir,
        },
      };
    }

    console.log(`using dynamic lang`);

    // get dynamic language attributes
    let langs = Array.from(vscodeLangIdToSupportedLanguage.keys());
    langs.push(...Array.from(vscodeLangIdToSupportedDynamicLanguage.keys()));

    const choice: "Try dynamic download" | "Ok" | undefined = await vscode.window.showErrorMessage(
      `Opened file in unsupported language: '${document.languageId}'` +
        ` (supported languages: ${Array.from(new Set(langs))})`,
      "Try dynamic download",
      "Ok"
    );

    if (choice !== "Try dynamic download") {
      return undefined;
    }

    const downloadCmd = await vscode.window.showInputBox({
      title: "Download tree-sitter grammar repo command",
      placeHolder: "git clone https://github.com/tree-sitter/tree-sitter-rust",
    });
    if (downloadCmd === undefined) {
      return undefined;
    }

    const symbol = await vscode.window.showInputBox({
      title: "Name of function that returns the Language object (probably just 'language')",
      placeHolder: "language",
    });
    if (symbol === undefined) {
      return undefined;
    }

    const name = await vscode.window.showInputBox({
      title: "Name of the library (probably tree_sitter_<lang>)",
      placeHolder: "tree_sitter_rust",
    });
    if (name === undefined) {
      return undefined;
    }

    const installDir = path.join(this.extensionParsersDirPath, name);
    await asyncFs.mkdir(installDir, { recursive: true });
    return {
      dynamic: {
        downloadCmd: downloadCmd,
        symbol: symbol,
        name: name,
        installDir: installDir,
      },
    };
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const docLang = await this.getDocLang(document);
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

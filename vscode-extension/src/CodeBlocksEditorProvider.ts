import * as core from "./core";
import * as path from "path";
import * as vscode from "vscode";
import { CodeBlocksEditor } from "./CodeBlocksEditor";
import { getOrInstallCli } from "./codeBlocks/installer/installer";

export type LanguageSupport = {
  parserInstaller: {
    downloadCmd: string;
    libraryName: string;
    languageFnSymbol: string;
  };
  queries: string[];
};

export type CodeBlocksExtensionSettings = {
  languageSupport: Map<string, LanguageSupport>;
};

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "codeBlocks.editor";
  public static readonly extensionBinDir = "bin";
  public static readonly parsersDir = "parsers";

  private extensionBinDirPath: string;
  private extensionParsersDirPath: string;
  private extensionSettings: CodeBlocksExtensionSettings;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.extensionBinDirPath = path.join(context.extensionPath, CodeBlocksEditorProvider.extensionBinDir);
    this.extensionParsersDirPath = path.join(context.extensionPath, CodeBlocksEditorProvider.parsersDir);

    const languageSupport: Record<string, LanguageSupport> | undefined = vscode.workspace
      .getConfiguration("codeBlocks")
      .get("languageSupport");
    if (languageSupport === undefined) {
      throw new Error("Invalid languageSupport settings");
    }

    this.extensionSettings = {
      languageSupport: new Map(Object.entries(languageSupport)),
    };
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
    // token: vscode.CancellationToken
  ): Promise<void> {
    const languageSupport = this.extensionSettings.languageSupport.get(document.languageId);
    if (languageSupport === undefined) {
      await vscode.window.showErrorMessage(
        `Opened file in language without support: '${document.languageId}'. Try adding ` +
          ` support via the 'codeBlocks.languageSupport' extension setting`
      );
      return;
    }

    const codeBlocksCliPath = await getOrInstallCli(this.extensionBinDirPath);
    if (codeBlocksCliPath === undefined) {
      await vscode.window.showErrorMessage("Server not installed");
      return;
    }

    const libraryPath = await core.installLanguage(codeBlocksCliPath, {
      ...languageSupport.parserInstaller,
      installDir: path.join(this.extensionParsersDirPath, languageSupport.parserInstaller.libraryName),
    });
    if (libraryPath === undefined) {
      await vscode.window.showErrorMessage("Parser not installed");
      return;
    }

    new CodeBlocksEditor(
      this.context,
      document,
      webviewPanel,
      codeBlocksCliPath,
      languageSupport.queries,
      libraryPath,
      languageSupport.parserInstaller.languageFnSymbol
    );
  }
}

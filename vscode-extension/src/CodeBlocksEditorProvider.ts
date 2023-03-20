import * as core from "./core";
import * as fs from "fs";
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
  codeBlocksCliPath: string | undefined;
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

    let binPath: string | undefined | null = vscode.workspace
      .getConfiguration("codeBlocks")
      .get("binPath");
    if (binPath === null || binPath === undefined || binPath.length === 0) {
      binPath = undefined;
    }

    console.log(`Got bin path: ${binPath}`);

    this.extensionSettings = {
      languageSupport: new Map(Object.entries(languageSupport)),
      codeBlocksCliPath: binPath
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

    const codeBlocksCliPath = this.extensionSettings.codeBlocksCliPath
      ?? await getOrInstallCli(this.extensionBinDirPath);

    console.log(`Using bin path: ${codeBlocksCliPath}`);

    if (codeBlocksCliPath === undefined) {
      await vscode.window.showErrorMessage("Server not installed");
      return;
    }

    const installDir = path.join(this.extensionParsersDirPath, languageSupport.parserInstaller.libraryName);
    let libraryPath = await core.installLanguage(codeBlocksCliPath, {
      ...languageSupport.parserInstaller,
      installDir: installDir,
    });

    while (libraryPath === undefined) {
      const choice = await vscode.window.showErrorMessage("Parser installation failed", "Reinstall", "Ok");
      if (choice === "Ok") {
        return;
      }

      if (fs.existsSync(installDir)) {
        fs.rmdirSync(installDir, { recursive: true });
      }
      libraryPath = await core.installLanguage(codeBlocksCliPath, {
        ...languageSupport.parserInstaller,
        installDir: installDir,
      });
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

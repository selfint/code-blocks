import * as vscode from "vscode";
import * as path from "path";
import { ParserInstaller, Dynamic, Query } from "./codeBlocks/types";
import { getOrInstallCli } from "./codeBlocks/installer/installer";
import { CodeBlocksEditor } from "./CodeBlocksEditor";

export type LanguageSupport = {
  parserInstaller: ParserInstaller;
  queries: Query[];
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

    const settings = vscode.workspace.getConfiguration("codeBlocks");
    const languageSupport =
      settings.get("languageSupport") !== undefined
        ? new Map(Object.entries(settings.get("languageSupport")!))
        : new Map();

    this.extensionSettings = {
      languageSupport: languageSupport,
    };
  }

  async getDocLangNQueries(lang: string): Promise<LanguageSupport | undefined> {
    const languageSupport = this.extensionSettings.languageSupport.get(lang);
    if (languageSupport === undefined) {
      await vscode.window.showErrorMessage(
        `Opened file in language without support: '${lang}'. Try adding ` +
          ` support via the 'codeBlocks.languageSupport' extension setting`
      );
      return undefined;
    }

    return languageSupport;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const languageSupport = await this.getDocLangNQueries(document.languageId);
    if (languageSupport === undefined) {
      return;
    }

    const codeBlocksCliPath = await getOrInstallCli(this.extensionBinDirPath);
    if (codeBlocksCliPath === undefined) {
      vscode.window.showErrorMessage("Server not installed");
      return;
    }

    const docLang = {
      dynamic: {
        ...languageSupport.parserInstaller,
        installDir: path.join(this.extensionParsersDirPath, languageSupport.parserInstaller.name),
      },
    };

    new CodeBlocksEditor(
      this.context,
      document,
      webviewPanel,
      codeBlocksCliPath,
      docLang,
      languageSupport.queries
    );
  }
}

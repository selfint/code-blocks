import * as vscode from "vscode";
import * as path from "path";
import { promises as asyncFs } from "fs";
import { ParserInstaller, SupportedDynamicLanguage, SupportedLanguage } from "./codeBlocks/types";
import { getOrInstallCli } from "./codeBlocks/installer/installer";
import { CodeBlocksEditor } from "./CodeBlocksEditor";
import { getQueryStrings } from "./codeBlocks/queries";

const vscodeLangIdToSupportedLanguage: Map<string, SupportedLanguage> = new Map([
  ["svelte", "svelte"],
  ["typescript", "typescript"],
  // ["typescriptreact", "tsx"],
  // ["rust", "rust"],
  ["python", "python"],
]);
const vscodeLangIdToSupportedDynamicLanguage: Map<string, SupportedDynamicLanguage> = new Map([
  ["svelte", "svelte"],
  ["typescript", "typescript"],
  ["typescriptreact", "tsx"],
  // ["rust", "rust"],
  ["python", "python"],
]);

export type CodeBlocksExtensionSettings = {
  queries: Map<string, string[]>;
  dynamicParsers: Map<string, ParserInstaller>;
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
    const queries =
      settings.get("queries") !== undefined ? new Map(Object.entries(settings.get("queries")!)) : new Map();
    const dynamicParsers =
      settings.get("dynamicParsers") !== undefined
        ? new Map(Object.entries(settings.get("dynamicParsers")!))
        : new Map();
    this.extensionSettings = {
      queries: queries,
      dynamicParsers: dynamicParsers,
    };
  }

  async getDocLang(lang: string): Promise<[SupportedLanguage, string[]] | [undefined, undefined]> {
    const supportedLang = vscodeLangIdToSupportedLanguage.get(lang);
    if (supportedLang !== undefined) {
      console.log(`using supported lang: ${supportedLang}`);
      return [supportedLang, getQueryStrings(supportedLang)];
    }

    const supportedDynamic = vscodeLangIdToSupportedDynamicLanguage.get(lang);
    if (supportedDynamic !== undefined) {
      vscode.window.showInformationMessage(
        `Using supported dynamic lang: ${supportedDynamic}, initial loading may take some time`
      );
      const installDir = path.join(this.extensionParsersDirPath, supportedDynamic);
      await asyncFs.mkdir(installDir, { recursive: true });
      return [
        {
          supporteddynamic: {
            language: supportedDynamic,
            installDir: installDir,
          },
        },
        getQueryStrings(supportedDynamic),
      ];
    }

    let langs = Array.from(vscodeLangIdToSupportedLanguage.keys());
    langs.push(...Array.from(vscodeLangIdToSupportedDynamicLanguage.keys()));
    langs.push(...Array.from(this.extensionSettings.dynamicParsers.keys()));

    const parserInstaller = this.extensionSettings.dynamicParsers.get(lang);
    if (parserInstaller === undefined) {
      await vscode.window.showErrorMessage(
        `Opened file in language without parser: '${lang}'. Try adding an` +
          ` installation config in the 'codeBlocks.dynamicParsers' extension setting,` +
          ` or using a supported language (supported languages: ${Array.from(new Set(langs))})`
      );
      return [undefined, undefined];
    }

    const queries = this.extensionSettings.queries.get(lang);
    if (queries === undefined) {
      await vscode.window.showErrorMessage(
        `Opened file in language without queries: '${lang}'. Try adding ` +
          ` queries in the 'codeBlocks.queries' extension setting` +
          ` or using a supported language (supported languages: ${Array.from(new Set(langs))})`
      );
      return [undefined, undefined];
    }

    const installDir = path.join(this.extensionParsersDirPath, parserInstaller!.name);
    return [
      {
        dynamic: {
          ...parserInstaller,
          installDir: installDir,
        },
      },
      queries,
    ];
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const [docLang, queries] = await this.getDocLang(document.languageId);
    if (docLang === undefined || queries === undefined) {
      return;
    }

    const codeBlocksCliPath = await getOrInstallCli(this.extensionBinDirPath);
    if (codeBlocksCliPath === undefined) {
      vscode.window.showErrorMessage("Server not installed");
      return;
    }

    new CodeBlocksEditor(this.context, document, webviewPanel, codeBlocksCliPath, docLang, queries);
  }
}

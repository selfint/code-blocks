import * as Installer from "../Installer";
import * as path from "path";
import * as vscode from "vscode";
import { CodeBlocksEditor } from "./CodeBlocksEditor";
import { FileTree } from "../FileTree";

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

    private extensionParsersDirPath: string;
    private extensionSettings: CodeBlocksExtensionSettings;

    constructor(private readonly context: vscode.ExtensionContext) {
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

        let language = await Installer.getLanguage(this.extensionParsersDirPath, document.languageId);

        while (language === undefined) {
            const choice = await vscode.window.showErrorMessage("Parser installation failed", "Retry", "Ok");
            if (choice === "Ok") {
                return;
            }

            language = await Installer.getLanguage(this.extensionParsersDirPath, document.languageId);
        }

        const queries = [];
        for (const query of languageSupport.queries) {
            queries.push(language.query(query));
        }
        const fileTree = await FileTree.new(language, document.getText());

        new CodeBlocksEditor(this.context, document, webviewPanel, queries, fileTree);
    }
}

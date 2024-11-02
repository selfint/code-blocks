import * as Installer from "../Installer";
import * as configuration from "../configuration";
import * as vscode from "vscode";
import { CodeBlocksEditor } from "./CodeBlocksEditor";
import { FileTree } from "../FileTree";

import { Query } from "tree-sitter";

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = "codeBlocks.editor";

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly extensionParsersDirPath: string
    ) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
        // token: vscode.CancellationToken
    ): Promise<void> {
        const languageId = document.languageId;
        const languageQueries = configuration.getLanguageConfig(languageId).queries;
        if (languageQueries === undefined) {
            await vscode.window.showErrorMessage(
                `Opened file in language without queries support: '${languageId}'. Try adding ` +
                    ` support via the '[${languageId}].codeBlocks.queries' setting`
            );
            return;
        }

        let language = await Installer.getLanguage(this.extensionParsersDirPath, languageId);

        while (language.status !== "ok") {
            const choice = await vscode.window.showErrorMessage(
                `Parser installation failed: ${language.result}`,
                "Retry",
                "Ok"
            );
            if (choice !== "Retry") {
                return;
            }

            language = await Installer.getLanguage(this.extensionParsersDirPath, languageId);
        }

        if (language.result === undefined) {
            return;
        }

        const queries = [];
        for (const query of languageQueries) {
            queries.push(new Query(language.result, query));
        }
        const fileTreeResult = await FileTree.new(language.result, document);
        if (fileTreeResult.status === "err") {
            await vscode.window.showErrorMessage(
                `Failed to load parser for ${languageId}: ${JSON.stringify(fileTreeResult.result)}`
            );
            return;
        }

        const fileTree = fileTreeResult.result;

        new CodeBlocksEditor(this.context, document, webviewPanel, queries, fileTree);
    }
}

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
            const items =
                language.result.cause === "loadFailed"
                    ? (["Remove", "Ok"] as const)
                    : (["Retry", "Ok"] as const);

            const choice = await vscode.window.showErrorMessage(
                `Parser installation failed: ${JSON.stringify(language.result)}`,
                ...items
            );

            if (choice === "Remove") {
                Installer.removeLanguage(this.extensionParsersDirPath, languageId);
                return;
            } else if (choice === "Retry") {
                language = await Installer.getLanguage(this.extensionParsersDirPath, languageId);
            } else {
                return;
            }
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
            const msg = JSON.stringify(fileTreeResult.result);
            await Installer.askRemoveLanguage(this.extensionParsersDirPath, languageId, msg);
            return;
        }

        const fileTree = fileTreeResult.result;

        new CodeBlocksEditor(this.context, document, webviewPanel, queries, fileTree);
    }
}

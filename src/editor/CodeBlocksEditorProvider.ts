import * as Installer from "../Installer";
import * as configuration from "../configuration";
import * as path from "path";
import * as vscode from "vscode";
import { CodeBlocksEditor } from "./CodeBlocksEditor";
import { FileTree } from "../FileTree";

import { Query } from "tree-sitter";

export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = "codeBlocks.editor";
    public static readonly parsersDir = "parsers";

    private extensionParsersDirPath: string;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.extensionParsersDirPath = path.join(context.extensionPath, CodeBlocksEditorProvider.parsersDir);
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
        // token: vscode.CancellationToken
    ): Promise<void> {
        const languageQueries = configuration.getLanguageConfig(document.languageId).queries;
        if (languageQueries === undefined) {
            await vscode.window.showErrorMessage(
                `Opened file in language without queries support: '${document.languageId}'. Try adding ` +
                    ` support via the '[${document.languageId}].codeBlocks.queries' setting`
            );
            return;
        }

        let language = await Installer.getLanguage(this.extensionParsersDirPath, document.languageId);

        while (language.status !== "ok") {
            const choice = await vscode.window.showErrorMessage(
                `Parser installation failed: ${language.result}`,
                "Retry",
                "Ok"
            );
            if (choice !== "Retry") {
                return;
            }

            language = await Installer.getLanguage(this.extensionParsersDirPath, document.languageId);
        }

        if (language.result === undefined) {
            return;
        }

        const queries = [];
        for (const query of languageQueries) {
            queries.push(new Query(language.result, query));
        }
        const fileTree = await FileTree.new(language.result, document);

        new CodeBlocksEditor(this.context, document, webviewPanel, queries, fileTree);
    }
}

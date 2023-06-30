import * as Installer from "./Installer";
import * as vscode from "vscode";
import { CodeBlocksEditorProvider } from "./editor/CodeBlocksEditorProvider";
import { FileTree } from "./FileTree";
import Parser from "web-tree-sitter";
import { join } from "path";

export const parserFinishedInit = new Promise<void>((resolve) => {
    void Parser.init().then(() => {
        resolve();
    });
});

async function reopenWithCodeBocksEditor(): Promise<void> {
    const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
        [key: string]: unknown;
        uri: vscode.Uri | undefined;
    };

    if (activeTabInput.uri !== undefined) {
        await vscode.commands.executeCommand("vscode.openWith", activeTabInput.uri, "codeBlocks.editor");
    }
}

async function openCodeBlocksEditorToTheSide(): Promise<void> {
    const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input as {
        [key: string]: unknown;
        uri: vscode.Uri | undefined;
    };

    if (activeTabInput.uri !== undefined) {
        await vscode.commands.executeCommand("vscode.openWith", activeTabInput.uri, "codeBlocks.editor");
        await vscode.commands.executeCommand("workbench.action.moveEditorToNextGroup");
    }
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            CodeBlocksEditorProvider.viewType,
            new CodeBlocksEditorProvider(context)
        )
    );

    const treeViewer = new TreeViewer();

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider("codeBlocks", treeViewer)
    );

    const parsersDir = join(context.extensionPath, "parsers");
    context.subscriptions.push(
        vscode.commands.registerCommand("codeBlocks.openTreeViewer", async () => {
            // only open file manually when we first open the tree view editor
            const openedDocuments = vscode.workspace.textDocuments;
            const updateManually = !openedDocuments.some(
                (e) => e.uri.toString() === TreeViewer.uri.toString()
            );

            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(TreeViewer.uri), {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true,
                preview: true,
            });

            if (updateManually) {
                await TreeViewer.update(parsersDir, treeViewer, vscode.window.activeTextEditor);
            }
        }),
        vscode.window.onDidChangeActiveTextEditor(
            async (editor) => await TreeViewer.update(parsersDir, treeViewer, editor)
        )
    );

    context.subscriptions.push(vscode.commands.registerCommand("codeBlocks.open", reopenWithCodeBocksEditor));
    context.subscriptions.push(
        vscode.commands.registerCommand("codeBlocks.openToTheSide", openCodeBlocksEditorToTheSide)
    );
}

export class TreeViewer implements vscode.TextDocumentContentProvider {
    public static readonly uri = vscode.Uri.parse("codeBlocks://view");
    readonly eventEmitter = new vscode.EventEmitter<vscode.Uri>();
    onDidChange: vscode.Event<vscode.Uri> | undefined = this.eventEmitter.event;

    private fileTree: FileTree | undefined = undefined;

    public static async update(
        parsersDir: string,
        treeViewer: TreeViewer,
        editor: vscode.TextEditor | undefined
    ): Promise<void> {
        if (editor === undefined) {
            treeViewer.viewFileTree(undefined);
            return;
        }

        const activeDocument = editor.document;
        const language = await Installer.getLanguage(parsersDir, activeDocument.languageId);
        if (language === undefined) {
            treeViewer.viewFileTree(undefined);
            return;
        }

        const fileTree = await FileTree.new(language, activeDocument);
        treeViewer.viewFileTree(fileTree);
    }

    public viewFileTree(fileTree: FileTree | undefined): void {
        this.fileTree = fileTree;
        this.eventEmitter.fire(TreeViewer.uri);
        this.fileTree?.onUpdate(() => this.eventEmitter.fire(TreeViewer.uri));
    }

    provideTextDocumentContent(_uri: vscode.Uri, _ct: vscode.CancellationToken): string {
        return this.fileTree?.toString() ?? "Syntax tree not available";
    }
}

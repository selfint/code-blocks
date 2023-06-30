import * as vscode from "vscode";
import { CodeBlocksEditorProvider } from "./editor/CodeBlocksEditorProvider";
import { FileTree } from "./FileTree";
import Parser from "web-tree-sitter";
import { TreeViewer } from "./TreeViewer";
import { getLanguage } from "./Installer";
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

async function getEditorFileTree(
    parsersDir: string,
    editor: vscode.TextEditor | undefined
): Promise<FileTree | undefined> {
    if (editor?.document === undefined) {
        return undefined;
    } else {
        const activeDocument = editor.document;
        const language = await getLanguage(parsersDir, activeDocument.languageId);
        if (language === undefined) {
            return undefined;
        } else {
            return await FileTree.new(language, activeDocument);
        }
    }
}

export function activate(context: vscode.ExtensionContext): void {
    const parsersDir = join(context.extensionPath, "parsers");

    let activeFileTree: FileTree | undefined = undefined;
    const onActiveFileTreeChange = new vscode.EventEmitter<FileTree | undefined>();
    void getEditorFileTree(parsersDir, vscode.window.activeTextEditor).then((activeFileTree) =>
        onActiveFileTreeChange.fire(activeFileTree)
    );

    let blockModeEnabled = false;
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBar.text = "-- BLOCK MODE --";

    context.subscriptions.push(
        statusBar,
        vscode.window.registerCustomEditorProvider(
            CodeBlocksEditorProvider.viewType,
            new CodeBlocksEditorProvider(context)
        ),
        vscode.workspace.registerTextDocumentContentProvider(TreeViewer.scheme, TreeViewer.treeViewer),
        onActiveFileTreeChange.event((newFileTree) => {
            TreeViewer.treeViewer.viewFileTree(newFileTree);
        }),
        onActiveFileTreeChange.event((newFileTree) => {
            activeFileTree = newFileTree;
            console.log(activeFileTree?.toString());
        }),
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            onActiveFileTreeChange.fire(await getEditorFileTree(parsersDir, editor));
        }),
        vscode.commands.registerCommand("codeBlocks.open", reopenWithCodeBocksEditor),
        vscode.commands.registerCommand("codeBlocks.openToTheSide", openCodeBlocksEditorToTheSide),
        vscode.commands.registerCommand("codeBlocks.toggle", async () => {
            blockModeEnabled = !blockModeEnabled;
            await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", blockModeEnabled);
            if (blockModeEnabled) {
                statusBar.show();
            } else {
                statusBar.hide();
            }
        }),
        vscode.commands.registerCommand("codeBlocks.openTreeViewer", async () => {
            await TreeViewer.treeViewer.open();
        })
    );
}

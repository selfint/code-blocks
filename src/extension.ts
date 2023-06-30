import * as vscode from "vscode";
import { CodeBlocksEditorProvider } from "./editor/CodeBlocksEditorProvider";
import Parser from "web-tree-sitter";
import { TreeViewer } from "./TreeViewer";
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
    const parsersDir = join(context.extensionPath, "parsers");
    let blockModeEnabled = false;
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBar.text = "-- BLOCK MODE --";

    context.subscriptions.push(
        statusBar,
        vscode.window.registerCustomEditorProvider(
            CodeBlocksEditorProvider.viewType,
            new CodeBlocksEditorProvider(context)
        ),
        vscode.commands.registerCommand("codeBlocks.open", reopenWithCodeBocksEditor),
        vscode.commands.registerCommand("codeBlocks.openToTheSide", openCodeBlocksEditorToTheSide),
        vscode.workspace.registerTextDocumentContentProvider(TreeViewer.scheme, TreeViewer.treeViewer),
        vscode.commands.registerCommand("codeBlocks.openTreeViewer", async () => {
            await TreeViewer.treeViewer.open(parsersDir);
        }),
        vscode.window.onDidChangeActiveTextEditor(
            async (editor) => await TreeViewer.treeViewer.update(parsersDir, editor)
        ),
        vscode.commands.registerCommand("codeBlocks.toggle", async () => {
            blockModeEnabled = !blockModeEnabled;
            await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", blockModeEnabled);
            if (blockModeEnabled) {
                statusBar.show();
            } else {
                statusBar.hide();
            }
        })
    );
}

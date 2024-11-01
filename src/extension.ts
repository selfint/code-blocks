import * as BlockMode from "./BlockMode";
import * as vscode from "vscode";
import { CodeBlocksEditorProvider } from "./editor/CodeBlocksEditorProvider";
import { FileTree } from "./FileTree";
import { TreeViewer } from "./TreeViewer";
import { getLanguage } from "./Installer";
import { join } from "path";
import { state } from "./state";

export const parserFinishedInit = Promise.resolve();

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
    }

    const activeDocument = editor.document;
    const language = await getLanguage(parsersDir, activeDocument.languageId);

    switch (language.status) {
        case "ok":
            if (language.result !== undefined) {
                return await FileTree.new(language.result, activeDocument);
            } else {
                return undefined;
            }

        case "err":
            void vscode.window.showErrorMessage(
                `Failed to load parser for ${activeDocument.languageId}: ${language.result}`
            );
            return undefined;
    }
}

export const active = state(true);
export const activeFileTree = state<FileTree | undefined>(undefined);

export function toggleActive(): void {
    active.set(!active.get());
}

export { BlockMode };

export function activate(context: vscode.ExtensionContext): void {
    const parsersDir = join(context.extensionPath, "parsers");

    void getEditorFileTree(parsersDir, vscode.window.activeTextEditor).then((newActiveFileTree) =>
        activeFileTree.set(newActiveFileTree)
    );

    const uiDisposables = [
        vscode.window.registerCustomEditorProvider(
            CodeBlocksEditorProvider.viewType,
            new CodeBlocksEditorProvider(context)
        ),
        vscode.workspace.registerTextDocumentContentProvider(TreeViewer.scheme, TreeViewer.treeViewer),
    ];

    const eventListeners = [
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!active.get()) {
                return;
            }

            if (editor?.document.uri.toString() === TreeViewer.uri.toString()) {
                return;
            }

            activeFileTree.set(await getEditorFileTree(parsersDir, editor));
        }),
        active.onDidChange(async (active) => {
            if (active && vscode.window.activeTextEditor !== undefined) {
                activeFileTree.set(await getEditorFileTree(parsersDir, vscode.window.activeTextEditor));
            }
        }),
        activeFileTree.onDidChange((newFileTree) => TreeViewer.viewFileTree(newFileTree)),
        BlockMode.blockModeActive.onDidChange(async (blockModeActive) => {
            if (
                blockModeActive &&
                active.get() &&
                activeFileTree.get() === undefined &&
                vscode.window.activeTextEditor !== undefined
            ) {
                activeFileTree.set(await getEditorFileTree(parsersDir, vscode.window.activeTextEditor));
            }
        }),
    ];

    const cmd = (
        command: string,
        callback: (...args: unknown[]) => unknown,
        thisArg?: unknown
    ): vscode.Disposable => vscode.commands.registerCommand(command, callback, thisArg);
    const commands = [
        cmd("codeBlocks.toggleActive", () => toggleActive()),
        cmd("codeBlocks.open", async () => await reopenWithCodeBocksEditor()),
        cmd("codeBlocks.openToTheSide", async () => await openCodeBlocksEditorToTheSide()),
        cmd("codeBlocks.openTreeViewer", async () => await TreeViewer.open()),
    ];

    const blockMode = BlockMode.activate();

    context.subscriptions.push(...uiDisposables, ...eventListeners, ...commands, ...blockMode);
}

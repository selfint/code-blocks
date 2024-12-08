import * as BlockMode from "./BlockMode";
import * as configuration from "./configuration";
import * as vscode from "vscode";
import * as Installer from "./Installer";
import { CodeBlocksEditorProvider } from "./editor/CodeBlocksEditorProvider";
import { FileTree } from "./FileTree";
import { TreeViewer } from "./TreeViewer";
import { getLogger } from "./outputChannel";
import { join } from "path";
import { state } from "./state";

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
    const logger = getLogger();

    if (editor?.document === undefined) {
        logger.log("No active document");
        return undefined;
    }

    const activeDocument = editor.document;
    const languageId = activeDocument.languageId;
    const language = await Installer.getLanguage(parsersDir, languageId);

    // sup-optimal conditional to make tsc happy
    // tl;dr this is handling logic for 'language not received' scenarios
    if (language.result === undefined || language.status === "err") {
        if (language.status === "ok") {
            logger.log(`No language found for ${languageId}`);
            return undefined;
        }

        switch (language.result.cause) {
            case "downloadFailed": {
                const doIgnore = await vscode.window.showErrorMessage(
                    `Failed to download language: ${language.result.msg}`,
                    "Add to ignore",
                    "Ok"
                );

                if (doIgnore === "Add to ignore") {
                    // fail silently if we can't add to ignore list
                    // we don't want to have two consecutive error messages
                    await configuration.addIgnoredLanguageId(languageId);
                }

                return undefined;
            }

            case "loadFailed": {
                await Installer.askRemoveLanguage(parsersDir, languageId, language.result.msg);
                return undefined;
            }
        }
    }

    const tree = await FileTree.new(language.result, activeDocument);
    if (tree.status === "ok") {
        return tree.result;
    }

    await Installer.askRemoveLanguage(parsersDir, languageId, JSON.stringify(tree.result));

    return undefined;
}

export const active = state(true);
export const activeFileTree = state<FileTree | undefined>(undefined);

export function toggleActive(): void {
    active.set(!active.get());
}

export { BlockMode };

export function activate(context: vscode.ExtensionContext): void {
    getLogger().log("CodeBlocks activated");

    const parsersDir = join(
        context.extensionPath,
        context.extensionMode === vscode.ExtensionMode.Test ? "test-parsers" : "parsers"
    );

    void getEditorFileTree(parsersDir, vscode.window.activeTextEditor).then((newActiveFileTree) =>
        activeFileTree.set(newActiveFileTree)
    );

    const uiDisposables = [
        vscode.window.registerCustomEditorProvider(
            CodeBlocksEditorProvider.viewType,
            new CodeBlocksEditorProvider(context, parsersDir)
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

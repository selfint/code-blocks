import * as vscode from "vscode";
import { FileTree, MoveSelectionDirection } from "./FileTree";
import { CodeBlocksEditorProvider } from "./editor/CodeBlocksEditorProvider";
import Parser from "web-tree-sitter";
import { TreeViewer } from "./TreeViewer";
import { UpdateSelectionDirection } from "./Selection";
import { getLanguage } from "./Installer";
import { join } from "path";

export function pointToPosition(point: Parser.Point): vscode.Position {
    return new vscode.Position(point.row, point.column);
}

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

function selectBlock(): void {
    if (vscode.window.activeTextEditor?.document === undefined || activeFileTree === undefined) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const cursorIndex = activeEditor.document.offsetAt(activeEditor.selection.active);
    const selection = activeFileTree.selectBlock(cursorIndex);
    if (selection !== undefined) {
        activeEditor.selection = selection.toVscodeSelection();
    }
}

function updateSelection(direction: UpdateSelectionDirection): void {
    if (vscode.window.activeTextEditor?.document === undefined || activeFileTree === undefined) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const selection = activeFileTree.resolveVscodeSelection(activeEditor.selection);
    if (selection !== undefined) {
        selection.update(direction);
        activeEditor.selection = selection.toVscodeSelection();
    }
}

async function moveSelection(direction: MoveSelectionDirection): Promise<void> {
    if (activeFileTree === undefined || vscode.window.activeTextEditor === undefined) {
        return;
    }

    const selection = activeFileTree.resolveVscodeSelection(vscode.window.activeTextEditor.selection);
    if (selection === undefined) {
        return;
    }

    const result = await activeFileTree.moveSelection(selection, direction);
    switch (result.status) {
        case "ok":
            vscode.window.activeTextEditor.selection = result.result;
            break;

        case "err":
            // TODO: add this as a text box above the cursor (can vscode do that?)
            void vscode.window.showErrorMessage(result.result);
            break;
    }
}

function updateTargetHighlights(editor: vscode.TextEditor, vscodeSelection: vscode.Selection): void {
    if (editor.document.uri !== activeFileTree?.document.uri) {
        return;
    }

    if (!blockModeEnabled) {
        return;
    }

    const selection = activeFileTree.resolveVscodeSelection(vscodeSelection);
    if (selection === undefined) {
        editor.setDecorations(targetsDecoration, []);
        editor.setDecorations(forceTargetsDecoration, []);
        return;
    }

    let parent = selection.ancestryChain.at(-1)?.parent ?? null;
    if (parent?.parent === null) {
        // parent is the entire file, not a relevant selection ever
        parent = null;
    }
    const previous = selection.selectedSiblings.at(0)?.previousNamedSibling ?? null;
    const next = selection.selectedSiblings.at(-1)?.nextNamedSibling ?? null;

    const targets = [];
    const forceTargets = [];

    if (previous !== null) {
        targets.push(
            new vscode.Range(pointToPosition(previous.startPosition), pointToPosition(previous.endPosition))
        );
    }

    if (next !== null) {
        targets.push(
            new vscode.Range(pointToPosition(next.startPosition), pointToPosition(next.endPosition))
        );
    }

    if ((next === null || previous === null) && parent !== null) {
        forceTargets.push(
            new vscode.Range(pointToPosition(parent.startPosition), pointToPosition(parent.endPosition))
        );
    }

    editor.setDecorations(targetsDecoration, targets);
    editor.setDecorations(forceTargetsDecoration, forceTargets);
}

export const onActiveFileTreeChange = new vscode.EventEmitter<FileTree | undefined>();
export let activeFileTree: FileTree | undefined = undefined;
// TODO: change block mode to mean the entire extension is enabled, not just query blocks
let blockModeEnabled = false;
const targetsDecorationColor = "var(--vscode-editor-selectionHighlightBackground)";
const forceTargetsDecorationColor = "var(--vscode-editor-linkedEditingBackground)";
let targetsDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: targetsDecorationColor,
});
let forceTargetsDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: forceTargetsDecorationColor,
});

export function activate(context: vscode.ExtensionContext): void {
    const parsersDir = join(context.extensionPath, "parsers");

    void getEditorFileTree(parsersDir, vscode.window.activeTextEditor).then((activeFileTree) =>
        onActiveFileTreeChange.fire(activeFileTree)
    );

    const onBlockModeChange = new vscode.EventEmitter<boolean>();
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBar.text = "-- BLOCK MODE --";

    function resetDecorations(): void {
        targetsDecoration.dispose();
        forceTargetsDecoration.dispose();
        targetsDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: targetsDecorationColor,
        });
        forceTargetsDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: forceTargetsDecorationColor,
        });
    }

    const uiDisposables = [
        statusBar,
        vscode.window.registerCustomEditorProvider(
            CodeBlocksEditorProvider.viewType,
            new CodeBlocksEditorProvider(context)
        ),
        vscode.workspace.registerTextDocumentContentProvider(TreeViewer.scheme, TreeViewer.treeViewer),
    ];

    const eventListeners = [
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            resetDecorations();

            if (editor?.document.uri.toString() === TreeViewer.uri.toString()) {
                return;
            }

            onActiveFileTreeChange.fire(await getEditorFileTree(parsersDir, editor));
        }),
        vscode.window.onDidChangeTextEditorSelection((event) =>
            updateTargetHighlights(event.textEditor, event.selections[0])
        ),
        onActiveFileTreeChange.event((newFileTree) => TreeViewer.viewFileTree(newFileTree)),
        onActiveFileTreeChange.event((newFileTree) => (activeFileTree = newFileTree)),
        onActiveFileTreeChange.event((_) => {
            const editor = vscode.window.activeTextEditor;
            if (editor !== undefined) {
                updateTargetHighlights(editor, editor.selection);
            }
        }),
        onBlockModeChange.event(async (newBlockMode) => {
            blockModeEnabled = newBlockMode;
            await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", blockModeEnabled);
            blockModeEnabled ? statusBar.show() : statusBar.hide();
        }),
        onBlockModeChange.event((newBlockMode) => activeFileTree?.toggleBlockMode(newBlockMode)),
        onBlockModeChange.event((blockModeEnabled) => {
            if (!blockModeEnabled) {
                resetDecorations();
            } else {
                if (vscode.window.activeTextEditor !== undefined) {
                    updateTargetHighlights(
                        vscode.window.activeTextEditor,
                        vscode.window.activeTextEditor.selection
                    );
                }
            }
        }),
    ];

    const cmd = (
        command: string,
        callback: (...args: unknown[]) => unknown,
        thisArg?: unknown
    ): vscode.Disposable => vscode.commands.registerCommand(command, callback, thisArg);
    const commands = [
        cmd("codeBlocks.open", async () => await reopenWithCodeBocksEditor()),
        cmd("codeBlocks.openToTheSide", async () => await openCodeBlocksEditorToTheSide()),
        cmd("codeBlocks.toggle", () => onBlockModeChange.fire(!blockModeEnabled)),
        cmd("codeBlocks.openTreeViewer", async () => await TreeViewer.open()),
        cmd("codeBlocks.moveUp", async () => await moveSelection("swap-previous")),
        cmd("codeBlocks.moveUpForce", async () => await moveSelection("before-parent")),
        cmd("codeBlocks.moveDown", async () => await moveSelection("swap-next")),
        cmd("codeBlocks.moveDownForce", async () => await moveSelection("after-parent")),
        cmd("codeBlocks.selectBlock", selectBlock),
        cmd("codeBlocks.selectParent", () => updateSelection("parent")),
        cmd("codeBlocks.selectChild", () => updateSelection("child")),
        cmd("codeBlocks.selectNext", () => updateSelection("add-next")),
        cmd("codeBlocks.selectPrevious", () => updateSelection("add-previous")),
    ];

    context.subscriptions.push(...uiDisposables, ...eventListeners, ...commands);
}

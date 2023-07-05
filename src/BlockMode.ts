import * as codeBlocks from "./extension";
import * as vscode from "vscode";
import { MoveSelectionDirection } from "./FileTree";
import { UpdateSelectionDirection } from "./Selection";

export let blockModeActive = false;
export const onDidChangeBlockModeActive = new vscode.EventEmitter<boolean>();

const targetsDecorationColor = "var(--vscode-editor-selectionHighlightBackground)";
const forceTargetsDecorationColor = "var(--vscode-editor-linkedEditingBackground)";
let targetsDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: targetsDecorationColor,
});
let forceTargetsDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: forceTargetsDecorationColor,
});

function resetDecorations(): void {
    // even if block mode isn't active, disposing these can't hurt
    targetsDecoration.dispose();
    forceTargetsDecoration.dispose();

    if (!blockModeActive) {
        return;
    }

    targetsDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: targetsDecorationColor,
    });
    forceTargetsDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: forceTargetsDecorationColor,
    });
}

function selectBlock(): void {
    const fileTree = codeBlocks.activeFileTree.get();
    if (vscode.window.activeTextEditor?.document === undefined || fileTree === undefined) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const cursorIndex = activeEditor.document.offsetAt(activeEditor.selection.active);
    const selection = fileTree.selectBlock(cursorIndex);
    if (selection !== undefined) {
        activeEditor.selection = selection.toVscodeSelection();
    }
}

function updateSelection(direction: UpdateSelectionDirection): void {
    const fileTree = codeBlocks.activeFileTree.get();
    if (vscode.window.activeTextEditor?.document === undefined || fileTree === undefined) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const selection = fileTree.resolveVscodeSelection(activeEditor.selection);
    if (selection !== undefined) {
        selection.update(direction, fileTree.blocks);
        activeEditor.selection = selection.toVscodeSelection();
    }
}

async function moveSelection(direction: MoveSelectionDirection): Promise<void> {
    const fileTree = codeBlocks.activeFileTree.get();
    if (fileTree === undefined || vscode.window.activeTextEditor === undefined) {
        return;
    }

    const selection = fileTree.resolveVscodeSelection(vscode.window.activeTextEditor.selection);
    if (selection === undefined) {
        return;
    }

    const result = await fileTree.moveSelection(selection, direction);
    switch (result.status) {
        case "ok":
            vscode.window.activeTextEditor.selection = result.result;
            break;

        case "err":
            // TODO: add this as a text box above the cursor (can vscode do that?)
            console.debug(result.result);
            break;
    }
}

function navigate(direction: "up" | "down" | "left" | "right"): void {
    const fileTree = codeBlocks.activeFileTree.get();
    if (vscode.window.activeTextEditor?.document === undefined || fileTree === undefined) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const selection = fileTree.resolveVscodeSelection(activeEditor.selection);
    const blocks = fileTree.blocks;
    const parent = selection?.getParent(blocks);
    const previous = selection?.getPrevious(blocks);
    const next = selection?.getNext(blocks);

    let newPosition;
    switch (direction) {
        case "up":
            if (parent) {
                newPosition = parent.toVscodeSelection().start;
            }
            break;
        case "down":
            if (parent) {
                newPosition = parent.toVscodeSelection().end;
            }
            break;
        case "left":
            if (previous) {
                newPosition = previous.toVscodeSelection().start;
            }
            break;
        case "right":
            if (next) {
                newPosition = next.toVscodeSelection().start;
            }
            break;
    }

    if (newPosition) {
        activeEditor.selection = new vscode.Selection(newPosition, newPosition);
    }
}

function updateTargetHighlights(editor: vscode.TextEditor, vscodeSelection: vscode.Selection): void {
    if (!blockModeActive) {
        return;
    }

    const fileTree = codeBlocks.activeFileTree.get();
    if (editor.document.uri !== fileTree?.document.uri) {
        return;
    }

    const selection = fileTree.resolveVscodeSelection(vscodeSelection);
    if (selection === undefined) {
        editor.setDecorations(targetsDecoration, []);
        editor.setDecorations(forceTargetsDecoration, []);
        return;
    }

    const blocks = fileTree.blocks;
    let parent = selection.getParent(blocks);
    if (parent?.firstNode().parent === null) {
        // parent is the entire file, not a relevant selection ever
        parent = undefined;
    }
    const previous = selection.getPrevious(blocks);
    const next = selection.getNext(blocks);

    const targets = [];
    const forceTargets = [];

    if (previous) {
        targets.push(previous.toVscodeSelection());
    }

    if (next) {
        targets.push(next.toVscodeSelection());
    }

    if ((!next || !previous) && parent) {
        forceTargets.push(parent.toVscodeSelection());
    }

    editor.setDecorations(targetsDecoration, targets);
    editor.setDecorations(forceTargetsDecoration, forceTargets);
}

export function toggleBlockMode(): void {
    blockModeActive = !blockModeActive;

    onDidChangeBlockModeActive.fire(blockModeActive);
}

export function activate(): vscode.Disposable[] {
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBar.text = "-- BLOCK MODE --";

    const uiDisposables = [statusBar];

    const eventListeners = [
        vscode.window.onDidChangeActiveTextEditor(resetDecorations),
        vscode.window.onDidChangeTextEditorSelection((event) =>
            updateTargetHighlights(event.textEditor, event.selections[0])
        ),
        codeBlocks.active.onDidChange((newActive) => {
            if (!newActive && blockModeActive) {
                blockModeActive = false;
                onDidChangeBlockModeActive.fire(blockModeActive);
            }
        }),
        codeBlocks.activeFileTree.onDidChange((_) => {
            const editor = vscode.window.activeTextEditor;
            if (editor !== undefined) {
                updateTargetHighlights(editor, editor.selection);
            }
        }),
        onDidChangeBlockModeActive.event(async (blockModeActive) => {
            await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", blockModeActive);
        }),
        onDidChangeBlockModeActive.event((blockModeActive) => {
            blockModeActive ? statusBar.show() : statusBar.hide();
            resetDecorations();

            if (vscode.window.activeTextEditor !== undefined) {
                updateTargetHighlights(
                    vscode.window.activeTextEditor,
                    vscode.window.activeTextEditor.selection
                );
            }
        }),
    ];

    const cmd = (
        command: string,
        callback: (...args: unknown[]) => unknown,
        thisArg?: unknown
    ): vscode.Disposable => vscode.commands.registerCommand(command, callback, thisArg);
    const commands = [
        cmd("codeBlocks.toggleBlockMode", () => toggleBlockMode()),
        cmd("codeBlocks.moveUp", async () => await moveSelection("swap-previous")),
        cmd("codeBlocks.moveUpForce", async () => await moveSelection("before-parent")),
        cmd("codeBlocks.moveDown", async () => await moveSelection("swap-next")),
        cmd("codeBlocks.moveDownForce", async () => await moveSelection("after-parent")),
        cmd("codeBlocks.selectBlock", selectBlock),
        cmd("codeBlocks.selectParent", () => updateSelection("parent")),
        cmd("codeBlocks.selectChild", () => updateSelection("child")),
        cmd("codeBlocks.selectNext", () => updateSelection("add-next")),
        cmd("codeBlocks.selectPrevious", () => updateSelection("add-previous")),
        cmd("codeBlocks.navigateUpForce", () => navigate("up")),
        cmd("codeBlocks.navigateDownForce", () => navigate("down")),
        cmd("codeBlocks.navigateUp", () => navigate("left")),
        cmd("codeBlocks.navigateDown", () => navigate("right")),
    ];

    return [...uiDisposables, ...eventListeners, ...commands];
}

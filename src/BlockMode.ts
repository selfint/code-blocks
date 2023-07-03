import * as codeBlocks from "./extension";
import * as vscode from "vscode";
import { MoveSelectionDirection, pointToPosition } from "./FileTree";
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
    if (vscode.window.activeTextEditor?.document === undefined || codeBlocks.activeFileTree === undefined) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const cursorIndex = activeEditor.document.offsetAt(activeEditor.selection.active);
    const selection = codeBlocks.activeFileTree.selectBlock(cursorIndex);
    if (selection !== undefined) {
        activeEditor.selection = selection.toVscodeSelection();
    }
}

function updateSelection(direction: UpdateSelectionDirection): void {
    if (vscode.window.activeTextEditor?.document === undefined || codeBlocks.activeFileTree === undefined) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const selection = codeBlocks.activeFileTree.resolveVscodeSelection(activeEditor.selection);
    if (selection !== undefined) {
        selection.update(direction);
        activeEditor.selection = selection.toVscodeSelection();
    }
}

async function moveSelection(direction: MoveSelectionDirection): Promise<void> {
    if (codeBlocks.activeFileTree === undefined || vscode.window.activeTextEditor === undefined) {
        return;
    }

    const selection = codeBlocks.activeFileTree.resolveVscodeSelection(
        vscode.window.activeTextEditor.selection
    );
    if (selection === undefined) {
        return;
    }

    const result = await codeBlocks.activeFileTree.moveSelection(selection, direction);
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

function navigate(direction: "up" | "down" | "left" | "right"): void {
    if (vscode.window.activeTextEditor?.document === undefined || codeBlocks.activeFileTree === undefined) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const selection = codeBlocks.activeFileTree.resolveVscodeSelection(activeEditor.selection);
    const parent = selection?.ancestryChain.at(-1)?.parent ?? null;
    const previous = selection?.selectedSiblings[0].previousNamedSibling ?? null;
    const next = selection?.selectedSiblings.at(-1)?.nextNamedSibling ?? null;

    let newPosition;
    switch (direction) {
        case "up":
            if (parent) {
                newPosition = pointToPosition(parent.startPosition);
            }
            break;
        case "down":
            if (parent) {
                newPosition = pointToPosition(parent.endPosition);
            }
            break;
        case "left":
            if (previous) {
                newPosition = pointToPosition(previous.startPosition);
            }
            break;
        case "right":
            if (next) {
                newPosition = pointToPosition(next.startPosition);
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

    if (editor.document.uri !== codeBlocks.activeFileTree?.document.uri) {
        return;
    }

    const selection = codeBlocks.activeFileTree.resolveVscodeSelection(vscodeSelection);
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

function toggleBlockMode(): void {
    if (blockModeActive) {
        blockModeActive = false;
    } else {
        blockModeActive = true;
        if (!codeBlocks.active) {
            codeBlocks.onDidChangeActive.fire(true);
        }
    }

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
        codeBlocks.onDidChangeActive.event((newActive) => {
            if (!newActive && blockModeActive) {
                blockModeActive = false;
                onDidChangeBlockModeActive.fire(blockModeActive);
            }
        }),
        codeBlocks.onActiveFileTreeChange.event((_) => {
            const editor = vscode.window.activeTextEditor;
            if (editor !== undefined) {
                updateTargetHighlights(editor, editor.selection);
            }
        }),
        onDidChangeBlockModeActive.event(async (blockModeActive) => {
            if (blockModeActive) {
                statusBar.show();
                if (vscode.window.activeTextEditor !== undefined) {
                    updateTargetHighlights(
                        vscode.window.activeTextEditor,
                        vscode.window.activeTextEditor.selection
                    );
                }
            } else {
                resetDecorations();
                statusBar.hide();
            }

            await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", blockModeActive);
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

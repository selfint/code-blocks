import * as codeBlocks from "./extension";
import * as configuration from "./configuration";
import * as vscode from "vscode";
import { MoveSelectionDirection } from "./FileTree";
import { UpdateSelectionDirection } from "./Selection";
import { getLogger } from "./outputChannel";
import { state } from "./state";

export const blockModeActive = state(false);
const colorConfig = state(configuration.getColorConfig());

const decorations = {
    sibling: vscode.window.createTextEditorDecorationType({
        backgroundColor: colorConfig.get().siblingColor,
    }),
    parent: vscode.window.createTextEditorDecorationType({
        backgroundColor: colorConfig.get().parentColor,
    }),
};

function resetDecorations(): void {
    // even if block mode isn't active, disposing these can't hurt
    decorations.sibling.dispose();
    decorations.parent.dispose();

    if (!blockModeActive.get() || !colorConfig.get().enabled) {
        return;
    }

    decorations.sibling = vscode.window.createTextEditorDecorationType({
        backgroundColor: colorConfig.get().siblingColor,
    });
    decorations.parent = vscode.window.createTextEditorDecorationType({
        backgroundColor: colorConfig.get().parentColor,
    });
}

function selectBlock(): void {
    const fileTree = codeBlocks.activeFileTree.get();
    const activeEditor = vscode.window.activeTextEditor;

    if (activeEditor?.document === undefined || fileTree === undefined) {
        return;
    }

    const bases = activeEditor.selections.length ? activeEditor.selections : [activeEditor.selection];
    const nextSelections = bases
        .map((s) => {
            const idx = activeEditor.document.offsetAt(s.active);
            const sel = fileTree.selectBlock(idx);
            return sel?.toVscodeSelection();
        })
        .filter((s): s is vscode.Selection => !!s);

    if (nextSelections.length === 0) {
        return;
    }

    const merged = mergeSelections(nextSelections);
    if (merged.length === 1) {
        activeEditor.selection = merged[0];
    } else {
        activeEditor.selections = merged;
    }

    activeEditor.revealRange(
        merged[0] ?? activeEditor.selection,
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

function updateSelection(direction: UpdateSelectionDirection): void {
    const fileTree = codeBlocks.activeFileTree.get();
    const activeEditor = vscode.window.activeTextEditor;

    if (activeEditor?.document === undefined || fileTree === undefined) {
        return;
    }

    const bases = activeEditor.selections.length ? activeEditor.selections : [activeEditor.selection];
    const updatedSelections: vscode.Selection[] = [];

    for (const base of bases) {
        const selection = fileTree.resolveVscodeSelection(base);
        if (selection === undefined) {
            continue;
        }

        selection.update(direction, fileTree.blocks);
        updatedSelections.push(selection.toVscodeSelection());
    }

    if (updatedSelections.length === 0) {
        return;
    }

    const merged = mergeSelections(updatedSelections);
    if (merged.length === 1) {
        activeEditor.selection = merged[0];
    } else {
        activeEditor.selections = merged;
    }

    activeEditor.revealRange(
        merged[0] ?? activeEditor.selection,
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

async function moveSelection(direction: MoveSelectionDirection): Promise<void> {
    const fileTree = codeBlocks.activeFileTree.get();
    const activeEditor = vscode.window.activeTextEditor;
    if (fileTree === undefined || activeEditor === undefined) {
        return;
    }

    const bases = activeEditor.selections.length ? activeEditor.selections : [activeEditor.selection];

    // Single-selection: preserve existing UX
    if (bases.length === 1) {
        const selection = fileTree.resolveVscodeSelection(bases[0]);
        if (selection === undefined) {
            return;
        }

        const result = await fileTree.moveSelection(selection, direction);
        if (result.status === "ok") {
            activeEditor.selection = result.result;
            activeEditor.revealRange(result.result, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        } else {
            getLogger().log(result.result);
        }

        return;
    }

    // Multi-selection: order moves to reduce interference
    const order = bases.map((_, i) => i);
    order.sort((i, j) => {
        const a = bases[i].start;
        const b = bases[j].start;
        const cmp = a.line - b.line || a.character - b.character;
        return direction === "swap-next" ? -cmp : cmp; // down: bottom->top, up: top->bottom
    });

    const results: (vscode.Selection | undefined)[] = bases.slice();
    for (const i of order) {
        const current = results[i] ?? bases[i];
        const selection = fileTree.resolveVscodeSelection(current);
        if (selection === undefined) {
            continue;
        }

        const res = await fileTree.moveSelection(selection, direction);
        if (res.status === "ok") {
            results[i] = res.result;
        } else {
            getLogger().log(res.result);
        }
    }

    const finalSelections = results.filter((s): s is vscode.Selection => !!s);
    if (finalSelections.length) {
        activeEditor.selections = finalSelections;
        activeEditor.revealRange(finalSelections[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
}

function navigate(direction: "up" | "down" | "left" | "right"): void {
    const fileTree = codeBlocks.activeFileTree.get();
    const activeEditor = vscode.window.activeTextEditor;

    if (activeEditor?.document === undefined || fileTree === undefined) {
        return;
    }

    const bases = activeEditor.selections.length ? activeEditor.selections : [activeEditor.selection];
    const blocks = fileTree.blocks;
    const nextCursors: vscode.Selection[] = [];

    for (const base of bases) {
        const selection = fileTree.resolveVscodeSelection(base);
        if (selection === undefined) {
            continue;
        }

        const parent = selection.getParent(blocks);
        const previous = selection.getPrevious(blocks);
        const next = selection.getNext(blocks);

        let newPosition: vscode.Position | undefined;
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
            nextCursors.push(new vscode.Selection(newPosition, newPosition));
        }
    }

    if (nextCursors.length === 0) {
        return;
    }

    const deduped = dedupeSelections(nextCursors);
    activeEditor.selections = deduped;
    activeEditor.revealRange(deduped[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * Merge overlapping or touching selections (used to keep UX tidy).
 */
function mergeSelections(selections: vscode.Selection[]): vscode.Selection[] {
    if (selections.length <= 1) {
        return selections;
    }

    const ranges = selections.map((s) => new vscode.Range(s.start, s.end));
    ranges.sort((a, b) => {
        if (a.start.isBefore(b.start)) {
            return -1;
        }
        if (a.start.isAfter(b.start)) {
            return 1;
        }
        if (a.end.isBefore(b.end)) {
            return -1;
        }
        if (a.end.isAfter(b.end)) {
            return 1;
        }
        return 0;
    });

    const merged: vscode.Range[] = [];
    for (const r of ranges) {
        const last = merged.at(-1);
        if (last === undefined) {
            merged.push(r);
        } else if (!r.start.isAfter(last.end)) {
            const end = r.end.isAfter(last.end) ? r.end : last.end;
            merged[merged.length - 1] = new vscode.Range(last.start, end);
        } else {
            merged.push(r);
        }
    }

    return merged.map((r) => new vscode.Selection(r.start, r.end));
}

/**
 * De-duplicate selections while preserving order.
 */
function dedupeSelections(selections: vscode.Selection[]): vscode.Selection[] {
    if (selections.length <= 1) {
        return selections;
    }

    selections.sort((a, b) => {
        if (a.start.isBefore(b.start)) {
            return -1;
        }
        if (a.start.isAfter(b.start)) {
            return 1;
        }
        if (a.end.isBefore(b.end)) {
            return -1;
        }
        if (a.end.isAfter(b.end)) {
            return 1;
        }
        return 0;
    });

    const seen = new Set<string>();
    const out: vscode.Selection[] = [];
    for (const s of selections) {
        const key = `${s.start.line}:${s.start.character}-${s.end.line}:${s.end.character}`;
        if (!seen.has(key)) {
            seen.add(key);
            out.push(s);
        }
    }
    return out;
}

function updateTargetHighlights(editor: vscode.TextEditor, vscodeSelection: vscode.Selection): void {
    if (!blockModeActive.get() || !colorConfig.get().enabled) {
        return;
    }

    const fileTree = codeBlocks.activeFileTree.get();
    if (editor.document.uri !== fileTree?.document.uri) {
        return;
    }

    const selection = fileTree.resolveVscodeSelection(vscodeSelection);
    if (selection === undefined) {
        editor.setDecorations(decorations.sibling, []);
        editor.setDecorations(decorations.parent, []);
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

    editor.setDecorations(decorations.sibling, targets);
    editor.setDecorations(decorations.parent, forceTargets);
}

export function toggleBlockMode(): void {
    blockModeActive.set(!blockModeActive.get());
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
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("colors")) {
                colorConfig.set(configuration.getColorConfig());
            }
        }),
        colorConfig.onDidChange((_) => {
            resetDecorations();
            const editor = vscode.window.activeTextEditor;
            if (editor !== undefined) {
                updateTargetHighlights(editor, editor.selection);
            }
        }),
        codeBlocks.active.onDidChange((newActive) => {
            if (!newActive && blockModeActive.get()) {
                blockModeActive.set(true);
            }
        }),
        codeBlocks.activeFileTree.onDidChange((_) => {
            const editor = vscode.window.activeTextEditor;
            if (editor !== undefined) {
                updateTargetHighlights(editor, editor.selection);
            }
        }),
        blockModeActive.onDidChange(async (active) => {
            await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", active);
        }),
        blockModeActive.onDidChange((active) => {
            if (active) {
                statusBar.show();
            } else {
                statusBar.hide();
            }

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
        cmd("codeBlocks.moveDown", async () => await moveSelection("swap-next")),
        cmd("codeBlocks.selectBlock", selectBlock),
        cmd("codeBlocks.selectParent", () => updateSelection("parent")),
        cmd("codeBlocks.selectChild", () => updateSelection("child")),
        cmd("codeBlocks.selectNext", () => updateSelection("add-next")),
        cmd("codeBlocks.selectPrevious", () => updateSelection("add-previous")),
        cmd("codeBlocks.navigateUpForce", () => navigate("up")),
        cmd("codeBlocks.navigateDownForce", () => navigate("down")),
        cmd("codeBlocks.navigateUp", () => navigate("left")),
        cmd("codeBlocks.navigateDown", () => navigate("right")),
        cmd("codeBlocks.toggleBlockModeColors", () => {
            const newConfig = colorConfig.get();
            newConfig.enabled = !newConfig.enabled;
            return colorConfig.set(newConfig);
        }),
    ];

    return [...uiDisposables, ...eventListeners, ...commands];
}

import * as vscode from "vscode";
import * as configuration from "./configuration";
import * as codeBlocks from "./extension";
import type { MoveSelectionDirection } from "./FileTree";
import { positionToPoint } from "./FileTree";
import { getLogger } from "./outputChannel";
import type { UpdateSelectionDirection } from "./Selection";
import { state } from "./state";
import { findContainingPair } from "./utilities/selectionUtils";

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

// Special decoration for pair-edit awaiting mode (high-contrast border + subtle background)
const pairEditDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.wordHighlightStrongBackground"),
    border: "3px solid var(--vscode-focusBorder)",
    borderRadius: "2px",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});
let pairEditStatusBar: vscode.StatusBarItem | undefined;
let __pairEditOriginalSelectionHashes: string[] = [];
let __awaitingPairEdit = false;
let __suppressPairEditSelectionValidation = false; // suppresses one selection validation cycle after internal pair-edit edits (delete/backspace)

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

function applyPairEditDecorations(editor?: vscode.TextEditor): void {
    const active = editor ?? vscode.window.activeTextEditor;
    if (!active) return;
    if (__awaitingPairEdit) {
        active.setDecorations(pairEditDecoration, active.selections.map(s => new vscode.Range(s.start, s.end)));
    } else {
        active.setDecorations(pairEditDecoration, []);
    }
}

function exitPairEditMode(): void {
    if (!__awaitingPairEdit) return;
    __awaitingPairEdit = false;
    void vscode.commands.executeCommand("setContext", "codeBlocks.awaitingPairEdit", false);
    applyPairEditDecorations();
    if (pairEditStatusBar) {
        pairEditStatusBar.hide();
    }
    __pairEditOriginalSelectionHashes = [];
}

function selectBlock(): void {
    const fileTree = codeBlocks.activeFileTree.get();
    const editor = vscode.window.activeTextEditor;

    if (!editor || !fileTree) return;

    const bases = editor.selections.length ? editor.selections : [editor.selection];
    const nextSelections = bases
        .map((s) => {
            const idx = editor.document.offsetAt(s.active);
            const sel = fileTree.selectBlock(idx);
            return sel?.toVscodeSelection();
        })
        .filter((s): s is vscode.Selection => !!s);

    if (nextSelections.length === 0) return;

    const merged = mergeSelections(nextSelections);
    if (merged.length === 1) editor.selection = merged[0];
    else editor.selections = merged;
    editor.revealRange(merged[0] ?? editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function updateSelection(direction: UpdateSelectionDirection): void {
    const fileTree = codeBlocks.activeFileTree.get();
    const editor = vscode.window.activeTextEditor;

    if (!editor || !fileTree) return;

    const bases = editor.selections.length ? editor.selections : [editor.selection];
    const updatedSelections: vscode.Selection[] = [];

    for (const base of bases) {
        const sel = fileTree.resolveVscodeSelection(base);
        if (!sel) continue;
        sel.update(direction, fileTree.blocks);
        updatedSelections.push(sel.toVscodeSelection());
    }

    if (updatedSelections.length === 0) return;

    const merged = mergeSelections(updatedSelections);
    if (merged.length === 1) editor.selection = merged[0];
    else editor.selections = merged;
    editor.revealRange(merged[0] ?? editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

async function moveSelection(direction: MoveSelectionDirection): Promise<void> {
    const fileTree = codeBlocks.activeFileTree.get();
    const editor = vscode.window.activeTextEditor;
    if (!fileTree || !editor) return;

    const bases = editor.selections.length ? editor.selections : [editor.selection];

    // Single-selection: preserve existing UX
    if (bases.length === 1) {
        const sel = fileTree.resolveVscodeSelection(bases[0]);
        if (!sel) return;
        const result = await fileTree.moveSelection(sel, direction);
        if (result.status === "ok") {
            editor.selection = result.result;
            editor.revealRange(result.result, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
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
        const sel = fileTree.resolveVscodeSelection(current);
        if (!sel) continue;
        const res = await fileTree.moveSelection(sel, direction);
        if (res.status === "ok") {
            results[i] = res.result;
        } else {
            getLogger().log(res.result);
        }
    }

    const finalSelections = results.filter((s): s is vscode.Selection => !!s);
    if (finalSelections.length) {
        editor.selections = finalSelections;
        editor.revealRange(finalSelections[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
}

function navigate(direction: "up" | "down" | "left" | "right"): void {
    const fileTree = codeBlocks.activeFileTree.get();
    const editor = vscode.window.activeTextEditor;

    if (!editor || !fileTree) return;

    const bases = editor.selections.length ? editor.selections : [editor.selection];
    const blocks = fileTree.blocks;
    const nextCursors: vscode.Selection[] = [];

    for (const base of bases) {
        const selection = fileTree.resolveVscodeSelection(base);
        if (!selection) continue;
        const parent = selection.getParent(blocks);
        const previous = selection.getPrevious(blocks);
        const next = selection.getNext(blocks);

        let newPosition: vscode.Position | undefined;
        switch (direction) {
            case "up":
                if (parent) newPosition = parent.toVscodeSelection().start;
                break;
            case "down":
                if (parent) newPosition = parent.toVscodeSelection().end;
                break;
            case "left":
                if (previous) newPosition = previous.toVscodeSelection().start;
                break;
            case "right":
                if (next) newPosition = next.toVscodeSelection().start;
                break;
        }

        if (newPosition) {
            nextCursors.push(new vscode.Selection(newPosition, newPosition));
        }
    }

    if (nextCursors.length === 0) return;
    const deduped = dedupeSelections(nextCursors);
    editor.selections = deduped;
    editor.revealRange(deduped[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * Public command: cycle selection inside / full / outer pairs.
 */
function selectInside(): void {
    const fileTree = codeBlocks.activeFileTree.get();
    const editor = vscode.window.activeTextEditor;
    if (!fileTree || !editor) return;

    const current = editor.selections.length ? editor.selections : [editor.selection];
    const next = current
        .map(sel => computeInsideCycle(sel, fileTree))
        .filter((s): s is vscode.Selection => !!s);

    if (next.length === 0) return;

    const merged = mergeSelections(next);
    if (merged.length === 1) {
        editor.selection = merged[0];
    } else {
        editor.selections = merged;
    }
    editor.revealRange(merged[0] ?? editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * Compute the "next inside or outside" selection to cycle through for a single selection.
 *
 * Rules:
 * 1. If the selection is strictly inside a pair's content -> expand to the pair's full range (including delimiters).
 * 2. If the selection is exactly the pair's full range -> try to expand to the outer pair's content or full range.
 * 3. Otherwise (cursor or arbitrary selection inside the pair) -> select the pair's content.
 */
function computeInsideCycle(selection: vscode.Selection, fileTree: ReturnType<typeof codeBlocks.activeFileTree.get>): vscode.Selection | undefined {
    if (!fileTree) return undefined;
    const node = fileTree.tree.rootNode.namedDescendantForPosition(positionToPoint(selection.start));
    let pair = findContainingPair(node);
    if (!pair) return undefined;

    // Sync `pair` with current selection depth.
    while (true) {
        const fullRange = new vscode.Range(pair.open.range.start, pair.close.range.end);
        if (selection.contains(fullRange) && !selection.isEqual(fullRange)) {
            const outer = findContainingPair(pair.node.parent);
            if (outer) pair = outer;
            else break;
        } else {
            break;
        }
    }

    const fullRange = new vscode.Range(pair.open.range.start, pair.close.range.end);
    if (selection.isEqual(pair.contentRange)) {
        return new vscode.Selection(fullRange.start, fullRange.end);
    }
    if (selection.isEqual(fullRange)) {
        const outer = findContainingPair(pair.node.parent);
        if (!outer) {
            return new vscode.Selection(fullRange.start, fullRange.end); // stays the same at top
        }
        // Toggle outer content/full if already on outer content next time.
        if (selection.isEqual(outer.contentRange)) {
            const outerFull = new vscode.Range(outer.open.range.start, outer.close.range.end);
            return new vscode.Selection(outerFull.start, outerFull.end);
        }
        return new vscode.Selection(outer.contentRange.start, outer.contentRange.end);
    }
    // Default: select content
    return new vscode.Selection(pair.contentRange.start, pair.contentRange.end);
}

/**
 * Merge overlapping or touching selections (used to keep UX tidy).
 */
function mergeSelections(selections: vscode.Selection[]): vscode.Selection[] {
    if (selections.length <= 1) return selections;
    const ranges = selections.map(s => new vscode.Range(s.start, s.end));
    ranges.sort((a, b) => {
        if (a.start.isBefore(b.start)) return -1;
        if (a.start.isAfter(b.start)) return 1;
        if (a.end.isBefore(b.end)) return -1;
        if (a.end.isAfter(b.end)) return 1;
        return 0;
    });
    const merged: vscode.Range[] = [];
    for (const r of ranges) {
        const last = merged[merged.length - 1];
        if (!last) {
            merged.push(r);
        } else if (!r.start.isAfter(last.end)) {
            const end = r.end.isAfter(last.end) ? r.end : last.end;
            merged[merged.length - 1] = new vscode.Range(last.start, end);
        } else {
            merged.push(r);
        }
    }
    return merged.map(r => new vscode.Selection(r.start, r.end));
}

/**
 * De-duplicate selections while preserving order.
 */
function dedupeSelections(selections: vscode.Selection[]): vscode.Selection[] {
    if (selections.length <= 1) return selections;
    selections.sort((a, b) => {
        if (a.start.isBefore(b.start)) return -1;
        if (a.start.isAfter(b.start)) return 1;
        if (a.end.isBefore(b.end)) return -1;
        if (a.end.isAfter(b.end)) return 1;
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

/**
 * Enter pair edit mode: select surrounding pair delimiters for all active selections.
 * Result: alternating open/close selections kept so user can replace delimiters by typing an opening char.
 */
function selectSurroundingPair(): void {
    const fileTree = codeBlocks.activeFileTree.get();
    const editor = vscode.window.activeTextEditor;
    if (!fileTree || !editor) return;

    const baseSelections = editor.selections.length ? editor.selections : [editor.selection];
    const collected = baseSelections.flatMap(sel => collectDelimiterSelections(sel, fileTree));
    if (collected.length === 0) return;

    const deduped = dedupeSelections(collected);
    editor.selections = deduped;
    __awaitingPairEdit = true;
    __pairEditOriginalSelectionHashes = deduped.map(s => `${s.start.line}:${s.start.character}-${s.end.line}:${s.end.character}`);
    void vscode.commands.executeCommand("setContext", "codeBlocks.awaitingPairEdit", true);
    applyPairEditDecorations(editor);

    if (!pairEditStatusBar) {
        pairEditStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    }
    pairEditStatusBar.text = "Pair Edit Mode: ( [ { ' \" ` to replace, Esc to exit (Esc again to collapse)";
    pairEditStatusBar.tooltip = "Press opening bracket/quote to replace delimiters. Esc exits (keeps selections).";
    pairEditStatusBar.show();

    editor.revealRange(deduped[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * Collect delimiter selections (open + close) for a single cursor/selection.
 */
function collectDelimiterSelections(sel: vscode.Selection, fileTree: ReturnType<typeof codeBlocks.activeFileTree.get>): vscode.Selection[] {
    if (!fileTree) return [];
    const node = fileTree.tree.rootNode.namedDescendantForPosition(positionToPoint(sel.start));
    const pair = findContainingPair(node);
    if (!pair) return [];
    return [
        new vscode.Selection(pair.open.range.start, pair.open.range.end),
        new vscode.Selection(pair.close.range.start, pair.close.range.end),
    ];
}

/**
 * Typing override behavior (updated):
 * - If NOT in pair edit mode: delegate straight to default:type.
 * - If in pair edit mode:
 *   * Opening delimiter: replace all selected delimiters (open slots get typed char, close slots get mapped closing) then exit mode.
 *   * Any other typed character: we now EXIT pair edit mode first, then pass through (user wants to freely edit).
 *
 * Note: The "delete" / "backspace" keys are not handled by the 'type' command. To keep pair edit
 * mode active while deleting you must bind a custom command (future enhancement). For now typing
 * a non-opening character exits the mode, while Escape exits without typing, and opening char performs replace.
 */
async function handleTypeOverride(args: { text: string } | undefined): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!args || !editor) {
        await vscode.commands.executeCommand("default:type", args);
        return;
    }
    if (!__awaitingPairEdit) {
        await vscode.commands.executeCommand("default:type", args);
        return;
    }

    const openToClose: Record<string, string> = {
        "(": ")",
        "[": "]",
        "{": "}",
        '"': '"',
        "'": "'",
        "`": "`",
    };
    const ch = args.text;
    const close = openToClose[ch];

    if (!close) {
        // Exit mode on first non-opening char, then let user type normally.
        exitPairEditMode();
        await vscode.commands.executeCommand("default:type", args);
        return;
    }

    const sels = editor.selections;
    if (sels.length % 2 !== 0) {
        // Safety fallback
        exitPairEditMode();
        await vscode.commands.executeCommand("default:type", args);
        return;
    }

    await editor.edit(
        eb => {
            for (let i = 0; i < sels.length; i++) {
                const isOpen = i % 2 === 0;
                eb.replace(sels[i], isOpen ? ch : close);
            }
        },
        { undoStopBefore: true, undoStopAfter: true },
    );

    exitPairEditMode();
}

/**
 * Escape override: first Escape while in pair-edit mode only exits the mode (keeps multi-selection).
 * Second Escape (handled by default) will then collapse the multi-selection.
 */
async function handleEscapeOverride(): Promise<void> {
    if (__awaitingPairEdit) exitPairEditMode();
    else await vscode.commands.executeCommand("default:cancelSelection");
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
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            resetDecorations();
            applyPairEditDecorations(editor ?? undefined);
        }),
        vscode.window.onDidChangeTextEditorSelection((event) => {
            updateTargetHighlights(event.textEditor, event.selections[0]);
            if (__awaitingPairEdit && event.textEditor === vscode.window.activeTextEditor) {
                // If we intentionally mutated selections (e.g. deleteLeft/deleteRight) keep mode alive.
                if (__suppressPairEditSelectionValidation) {
                    __pairEditOriginalSelectionHashes = event.selections.map(s => `${s.start.line}:${s.start.character}-${s.end.line}:${s.end.character}`);
                    __suppressPairEditSelectionValidation = false;
                    applyPairEditDecorations(event.textEditor);
                    return;
                }
                const hashes = event.selections.map(s => `${s.start.line}:${s.start.character}-${s.end.line}:${s.end.character}`);
                const same =
                    hashes.length === __pairEditOriginalSelectionHashes.length &&
                    hashes.every((h, i) => h === __pairEditOriginalSelectionHashes[i]);
                if (!same) {
                    // Selections diverged (user clicked / multi-cursor change). Exit mode.
                    exitPairEditMode();
                } else {
                    applyPairEditDecorations(event.textEditor);
                }
            }
        }),
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
                applyPairEditDecorations(editor);
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
                if (__awaitingPairEdit) applyPairEditDecorations(editor);
            }
        }),
        blockModeActive.onDidChange(async (active) => {
            await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", active);
        }),
        blockModeActive.onDidChange((active) => {
            active ? statusBar.show() : statusBar.hide();
            resetDecorations();

            if (vscode.window.activeTextEditor !== undefined) {
                updateTargetHighlights(
                    vscode.window.activeTextEditor,
                    vscode.window.activeTextEditor.selection
                );
                if (__awaitingPairEdit) applyPairEditDecorations(vscode.window.activeTextEditor);
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
        cmd("codeBlocks.selectInside", selectInside),
        cmd("codeBlocks.selectSurroundingPair", selectSurroundingPair),
        cmd("codeBlocks.toggleBlockModeColors", () => {
            const newConfig = colorConfig.get();
            newConfig.enabled = !newConfig.enabled;
            return colorConfig.set(newConfig);
        }),
        // Typing intercept: only modifies behavior for opening delimiters while awaiting pair edit
        cmd("type", (...args: unknown[]) => {
            void handleTypeOverride(args[0] as { text: string } | undefined);
        }),
        cmd("codeBlocks.handleEscape", handleEscapeOverride),
        // Pair-edit aware backspace: keep mode active, update stored hashes so selection watcher doesn't exit.
        cmd("codeBlocks.pairEdit.deleteLeft", async () => {
            if (__awaitingPairEdit) {
                __suppressPairEditSelectionValidation = true;
                await vscode.commands.executeCommand("deleteLeft");
                applyPairEditDecorations(vscode.window.activeTextEditor ?? undefined);
                // Refresh stored hashes after deletion (selections may have collapsed to insertion points)
                const ed = vscode.window.activeTextEditor;
                if (ed) {
                    __pairEditOriginalSelectionHashes = ed.selections.map(s => `${s.start.line}:${s.start.character}-${s.end.line}:${s.end.character}`);
                }
            } else {
                await vscode.commands.executeCommand("deleteLeft");
            }
        }),
        // Pair-edit aware delete (forward delete)
        cmd("codeBlocks.pairEdit.deleteRight", async () => {
            if (__awaitingPairEdit) {
                __suppressPairEditSelectionValidation = true;
                await vscode.commands.executeCommand("deleteRight");
                applyPairEditDecorations(vscode.window.activeTextEditor ?? undefined);
                const ed = vscode.window.activeTextEditor;
                if (ed) {
                    __pairEditOriginalSelectionHashes = ed.selections.map(s => `${s.start.line}:${s.start.character}-${s.end.line}:${s.end.character}`);
                }
            } else {
                await vscode.commands.executeCommand("deleteRight");
            }
        }),
    ];

    return [...uiDisposables, ...eventListeners, ...commands];
}

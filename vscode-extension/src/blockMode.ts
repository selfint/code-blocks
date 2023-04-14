import * as core from "./core";
import * as vscode from "vscode";
import { BlockLocation, BlockLocationTree, GetSubtreesArgs, GetSubtreesResponse, MoveBlockArgs, MoveBlockResponse } from "./codeBlocksWrapper/types";
import { join } from "path";

export function registerBlockModeCommands(context: vscode.ExtensionContext): void {
    function registerCommand(name: string, callback: () => unknown): void {
        vscode.commands.registerCommand(`codeBlocks.${name}`, callback);
    }

    let blockMode: BlockMode | undefined = undefined;

    registerCommand("toggle", async () => {
        if (blockMode === undefined) {
            blockMode = await BlockMode.build(context);
        } else {
            await blockMode.dispose();
            blockMode = undefined;
        }
    });

}

type BlockModeEvent =
    { kind: "contentChanged", text: string }
    | { kind: "positionChanged", position: vscode.Position }
    | { kind: "moveRequest", direction: "up" | "down", force: boolean };

/**
 * Either a selected block and possible siblings OR no selections.
 */
type Selections = [TargetLocation | undefined, BlockLocation, TargetLocation | undefined] | undefined;
type TargetLocation = [BlockLocation, boolean];
type ConfigColors = {
    selected: string | undefined;
    target: string | undefined;
    forceTarget: string | undefined;
};

class BlockMode implements vscode.Disposable {
    readonly selectedDecoration: vscode.TextEditorDecorationType;
    readonly targetsDecoration: vscode.TextEditorDecorationType;
    readonly forceTargetsDecoration: vscode.TextEditorDecorationType;
    readonly codeBlocksCliPath: string;
    readonly parsersDir: string;

    editorState: EditorState | undefined = undefined;

    disposables: vscode.Disposable[];

    public static async build(context: vscode.ExtensionContext): Promise<BlockMode | undefined> {
        console.log("build");
        const parsersDir = join(context.extensionPath, "parsers");
        const binDir = join(context.extensionPath, "bin");
        const codeBlocksCliPath = await core.getCodeBlocksCliPath(binDir);
        if (codeBlocksCliPath === undefined) {
            console.log("Didn't get code blocks cli path");
            return undefined;
        }

        const configColors: ConfigColors | undefined = vscode.workspace
            .getConfiguration("codeBlocks")
            .get("colors");

        const colors = {
            selected: configColors?.selected ?? "var(--vscode-inputOption-activeBackground)",
            target: configColors?.target ?? "var(--vscode-editor-selectionHighlightBackground)",
            forceTarget: configColors?.forceTarget ?? "var(--vscode-editor-linkedEditingBackground)",
        };

        const blockMode = new BlockMode(parsersDir, codeBlocksCliPath, colors);

        await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", true);

        if (vscode.window.activeTextEditor !== undefined) {
            await blockMode.openEditor(vscode.window.activeTextEditor);
        }

        return blockMode;
    }

    private constructor(parsersDir: string, codeBlocksCliPath: string, colors: ConfigColors) {
        console.log("constructor");
        this.parsersDir = parsersDir;
        this.codeBlocksCliPath = codeBlocksCliPath;
        this.selectedDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: colors.selected,
        });
        this.targetsDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: colors.target,
        });
        this.forceTargetsDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: colors.forceTarget,
        });

        this.disposables = [
            vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left),
            vscode.window.setStatusBarMessage("-- BLOCK MODE --"),
            vscode.window.onDidChangeActiveTextEditor(async editor => {
                if (editor === undefined) {
                    this.closeEditor();
                } else if (this.editorState?.ofEditor !== editor) {
                    this.closeEditor();
                    await this.openEditor(editor);
                }
            }),

            vscode.workspace.onDidChangeTextDocument(async documentChanged => {
                console.log(`got document changed event`);
                // if (this.editorState?.ofEditor.document === documentChanged.document) {
                //     await this.updateEditorBlocks(documentChanged.document.getText());
                // }
            }),

            vscode.window.onDidChangeTextEditorSelection(async selection => {
                console.log("got selection changed event");
                // return await this.updateEditorSelections(selection.selections[0].active);
            })
        ];
    }

    async dispose(): Promise<void> {
        console.log("dispose");
        await vscode.commands.executeCommand("setContext", "codeBlocks.blockMode", false);
        await Promise.all(this.disposables.map(async d => { await d.dispose(); }));
        this.closeEditor();
    }

    private async openEditor(editor: vscode.TextEditor): Promise<void> {
        console.log("openEditor");
        const wrapper = await EditorCoreWrapper.build(editor, this.codeBlocksCliPath, this.parsersDir);
        if (wrapper === undefined) {
            return;
        }

        this.editorState = new EditorState(editor, wrapper);
        // await this.updateEditorBlocks(editor.document.getText());
        // await this.updateEditorSelections(editor.selection.active);
    }

    private closeEditor(): void {
        console.log("closeEditor");
        this.editorState?.ofEditor.setDecorations(this.selectedDecoration, []);
        this.editorState?.ofEditor.setDecorations(this.targetsDecoration, []);
        this.editorState?.ofEditor.setDecorations(this.forceTargetsDecoration, []);
        this.editorState = undefined;
    }
}

class EditorState {
    readonly ofEditor: vscode.TextEditor;
    readonly editorCoreWrapper: EditorCoreWrapper;
    blocks: BlockLocationTree[] | undefined;
    selections: Selections = undefined;

    constructor(editor: vscode.TextEditor, editorCoreWrapper: EditorCoreWrapper) {
        this.ofEditor = editor;
        this.editorCoreWrapper = editorCoreWrapper;
    }
}


class EditorCoreWrapper {
    private codeBlocksCliPath: string;
    private languageSupport: core.LanguageSupport;
    private libraryPath: string;

    public static async build(
        editor: vscode.TextEditor,
        codeBlocksCliPath: string,
        parsersDir: string
    ): Promise<EditorCoreWrapper | undefined> {
        const languageSupport = core.getLanguageSupport(editor.document.languageId);
        if (languageSupport === undefined) {
            console.log(`Got unsupported languageId: ${editor.document.languageId}`);
            return undefined;
        }

        const libraryPath = await core.cachedInstallLanguage(
            codeBlocksCliPath,
            {
                installDir: join(parsersDir, languageSupport.parserInstaller.libraryName),
                ...languageSupport.parserInstaller,
            },
        );
        if (libraryPath === undefined) {
            console.log(`Failed to install language: ${languageSupport.parserInstaller.libraryName}`);
            return undefined;
        }

        return new EditorCoreWrapper(codeBlocksCliPath, languageSupport, libraryPath);
    }

    constructor(
        codeBlocksCliPath: string,
        languageSupport: core.LanguageSupport,
        libraryPath: string,
    ) {
        this.codeBlocksCliPath = codeBlocksCliPath;
        this.languageSupport = languageSupport;
        this.libraryPath = libraryPath;
    }

    public async getBlocks(text: string): Promise<GetSubtreesResponse | undefined> {
        const args: GetSubtreesArgs = {
            queries: this.languageSupport.queries,
            text,
            libraryPath: this.libraryPath,
            languageFnSymbol: this.languageSupport.parserInstaller.languageFnSymbol,
        };

        return await core.getBlocks(this.codeBlocksCliPath, args);
    }

    public async moveBlock(
        text: string,
        srcBlock: BlockLocation,
        dstBlock: BlockLocation,
        force: boolean,
    ): Promise<MoveBlockResponse | undefined> {
        const args: MoveBlockArgs = {
            queries: this.languageSupport.queries,
            text,
            libraryPath: this.libraryPath,
            languageFnSymbol: this.languageSupport.parserInstaller.languageFnSymbol,
            srcBlock,
            dstBlock,
            force,
        };

        return await core.moveBlock(this.codeBlocksCliPath, args, false);
    }
}


function findSelections(blocks: BlockLocationTree[] | undefined, cursor: vscode.Position): Selections {
    if (blocks === undefined) {
        return undefined;
    }

    function cursorInBlock(block: BlockLocation): boolean {
        return cursor.isAfterOrEqual(new vscode.Position(block.startRow, block.startCol))
            && cursor.isBefore(new vscode.Position(block.endRow, block.endCol));
    }

    function findTreesSelections(trees: BlockLocationTree[]): Selections {
        for (let i = 0; i < trees.length; i++) {
            const tree = trees[i];

            if (!cursorInBlock(tree.block)) {
                continue;
            }

            const selections = findTreesSelections(tree.children);
            if (selections !== undefined) {
                const [childPrev, selected, childNext] = selections;
                if (childNext === undefined) {
                    return [childPrev, selected, [tree.block, true]];
                } else {
                    return selections;
                }
            }

            const prev: TargetLocation | undefined = i > 0 ? [trees[i - 1].block, false] : undefined;
            const next: TargetLocation | undefined = i < trees.length - 1 ? [trees[i + 1].block, false] : undefined;

            return [prev, tree.block, next];
        }

        return undefined;
    }

    return findTreesSelections(blocks);
}
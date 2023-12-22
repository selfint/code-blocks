import * as vscode from "vscode";
import { BlockMode, active, activeFileTree } from "../extension";
import { FileTree } from "../FileTree";
import { expect } from "chai";
import { join } from "path";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import settings from "./examples-editor/.vscode/settings.json";

const TEST_START_SIGNAL = "@";
export async function initExample(): Promise<void> {
    const exampleEditorPath = join(__dirname, "examples-editor");
    await cmd("workbench.action.toggleLightDarkThemes");
    await cmd("vscode.openFolder", vscode.Uri.file(exampleEditorPath), {
        forceNewWindow: false,
    });
    await cmd("notifications.clearAll");
    await sleep(100);
    await cmd("notifications.clearAll");
}

export async function cmd(c: string, ...args: unknown[]): Promise<void> {
    await vscode.commands.executeCommand(c, ...args);
}

export function zoomOut(): void {
    void vscode.commands.executeCommand("editor.action.fontZoomOut");
}

export async function startRecording(): Promise<void> {
    // write the test start signal and wait until it is flushed
    // TODO: should we handle stdout write errors more gracefully?
    await new Promise(r => process.stdout.write(TEST_START_SIGNAL, r));
}

export async function type(
    editor: vscode.TextEditor,
    position: vscode.Position,
    text: string,
    delay: number
): Promise<vscode.Position> {
    const chars = text.split("");
    const document = editor.document;
    let target = position;
    let offset = document.offsetAt(position);
    for (const char of chars) {
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, target, char);
        editor.selection = new vscode.Selection(target, target);
        await vscode.workspace.applyEdit(edit);
        const noise = Math.random() * (delay / 2) - delay / 4;
        await sleep(delay + noise);
        offset++;
        target = document.positionAt(offset);
    }

    return target;
}

export async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function notify(msg: string): Promise<void> {
    await vscode.commands.executeCommand("notifications.clearAll");
    void vscode.window.showInformationMessage(msg);
}

/**
 * Languages with .wasm parsers tracked by git
 */
export type SupportedTestLanguages = "rust" | "typescriptreact";
export type OpenDocumentParams = {
    language: SupportedTestLanguages;
    content: string;
    maximize?: boolean;
    cursor?: string;
};

export async function openDocument({
    language,
    content,
    maximize = true,
    cursor = undefined,
}: OpenDocumentParams): Promise<{ activeEditor: vscode.TextEditor; fileTree: FileTree; realContent: string }> {
    if (!active.get()) {
        active.set(true);
    }

    if (!BlockMode.blockModeActive.get()) {
        BlockMode.toggleBlockMode();
    }

    let cursorIndex = -1;
    if (cursor !== undefined) {
        cursorIndex = content.indexOf(cursor);
        expect(cursorIndex).not.to.equal(-1, `failed to find cursor '${cursor}' in content:\n${content}`);

        content = content.replace(cursor, "");
    }

    const activeEditor = await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument({ language, content })
    );

    if (cursorIndex !== -1) {
        activeEditor.selection = new vscode.Selection(
            activeEditor.document.positionAt(cursorIndex),
            activeEditor.document.positionAt(cursorIndex)
        );
    }

    if (maximize) {
        await vscode.commands.executeCommand("workbench.action.minimizeOtherEditors");
    }

    let fileTree = activeFileTree.get();
    if (fileTree === undefined) {
        fileTree = await new Promise<FileTree>((r) => {
            activeFileTree.onDidChange((fileTree) => {
                if (fileTree !== undefined) {
                    r(fileTree);
                }
            });
        });
    }

    return { activeEditor, fileTree, realContent: content };
}

export type SelectionCommand =
    | "codeBlocks.selectBlock"
    | "codeBlocks.selectPrevious"
    | "codeBlocks.selectNext"
    | "codeBlocks.selectParent"
    | "codeBlocks.selectChild";

export type TestSelectionCommandsParams = {
    language: SupportedTestLanguages;
    content: string;
    cursor: string;
    selectionCommands: SelectionCommand[];
    expectedSelectionContent: string;
    pause: number;
};

export async function selectionExample({
    content,
    cursor,
    selectionCommands,
    expectedSelectionContent,
    language,
    pause,
}: TestSelectionCommandsParams): Promise<vscode.TextEditor> {
    await initExample();

    const { activeEditor } = await openDocument({
        language,
        content,
        maximize: true,
        cursor,
    });

    await sleep(1000);

    await startRecording();

    for (const command of selectionCommands) {
        await notify(`Call '${command}' command`);
        await sleep(pause);
        await vscode.commands.executeCommand(command);
        await sleep(pause);
    }

    const selectionContent = activeEditor.document.getText(activeEditor.selection);
    expect(selectionContent).to.equal(
        expectedSelectionContent,
        "selection commands didn't produce desired selection"
    );

    return activeEditor;
}

export type MoveCommand =
    | "codeBlocks.moveDown"
    | "codeBlocks.moveUp";

export type TestMoveCommandsParams = {
    language: SupportedTestLanguages;
    content: string;
    cursor: string;
    selectionCommands: SelectionCommand[];
    selectionMessage: string;
    moveCommands: MoveCommand[];
    expectedSelectionContent: string;
    expectedContent: string;
    pause: number;
};
export async function moveExample({
    language,
    content,
    cursor,
    selectionCommands,
    selectionMessage,
    moveCommands,
    expectedSelectionContent,
    expectedContent,
    pause,
}: TestMoveCommandsParams): Promise<void> {
    await initExample();

    const { activeEditor } = await openDocument({
        language,
        content,
        maximize: true,
        cursor,
    });

    await sleep(1000);

    await startRecording();

    await notify(selectionMessage);
    await sleep(pause);

    for (const command of selectionCommands) {
        await vscode.commands.executeCommand(command);
        await sleep(pause / 3);
    }

    await sleep(pause);

    const selectionContent = activeEditor.document.getText(activeEditor.selection);
    expect(selectionContent).to.equal(
        expectedSelectionContent,
        "selection commands didn't produce desired selection"
    );

    for (const command of moveCommands) {
        await notify(`Call '${command}' command`);
        await sleep(pause);
        await vscode.commands.executeCommand(command);
        await sleep(pause);
    }

    const newContent = activeEditor.document.getText();
    const newSelectionContent = activeEditor.document.getText(activeEditor.selection);

    expect(newContent).to.equal(expectedContent, "move command didn't produce desired content");
    expect(newSelectionContent).to.equal(
        expectedSelectionContent,
        "move command didn't preserve selection content"
    );
}

export type NavigationCommand =
    | "codeBlocks.navigateDown"
    | "codeBlocks.navigateUp"
    | "codeBlocks.navigateUpForce"
    | "codeBlocks.navigateDownForce";

export type TestNavigationCommandsParams = {
    testSelectionParams: TestSelectionCommandsParams;
    navigateCommands: NavigationCommand[];
};
export async function testNavigateCommands({
    testSelectionParams,
    navigateCommands,
}: TestNavigationCommandsParams): Promise<void> {
    const targetCursor = "#";
    const expectedNavigationDestinationIndex = testSelectionParams.content
        .replace(/@/g, "")
        .indexOf(targetCursor);
    expect(expectedNavigationDestinationIndex).not.to.equal(
        -1,
        `target cursor '${targetCursor}' missing from input:\n${testSelectionParams.content}\n\n`
    );
    testSelectionParams.content = testSelectionParams.content.replace(targetCursor, "");

    const activeEditor = await selectionExample(testSelectionParams);

    for (const command of navigateCommands) {
        await vscode.commands.executeCommand(command);
    }

    const newCursorIndex = activeEditor.document.offsetAt(activeEditor.selection.active);

    const cleanContent = testSelectionParams.content.replace(/@/g, "");
    expect(newCursorIndex).to.equal(
        expectedNavigationDestinationIndex,
        "navigation commands didn't arrive to expected destination" +
        `\n\tactual: ${cleanContent.substring(0, newCursorIndex) +
        targetCursor +
        cleanContent.substring(newCursorIndex)
        }` +
        `\n\texpect: ${cleanContent.substring(0, expectedNavigationDestinationIndex) +
        targetCursor +
        cleanContent.substring(expectedNavigationDestinationIndex)
        }\n`
    );
}

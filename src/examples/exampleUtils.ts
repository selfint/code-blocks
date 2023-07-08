import * as vscode from "vscode";
import { BlockMode, active, activeFileTree } from "../extension";
import { FileTree } from "../FileTree";
import { expect } from "chai";
import { join } from "path";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import settings from "./examples-editor/.vscode/settings.json";

export async function openFolder(): Promise<void> {
    const exampleEditorPath = join(__dirname, "examples-editor");
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(exampleEditorPath), {
        forceNewWindow: false,
    });
    await vscode.commands.executeCommand("notifications.clearAll");
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
};

export async function openDocument({
    language,
    content,
    maximize = false,
}: OpenDocumentParams): Promise<{ activeEditor: vscode.TextEditor; fileTree: FileTree }> {
    if (!active.get()) {
        active.set(true);
    }

    if (!BlockMode.blockModeActive.get()) {
        BlockMode.toggleBlockMode();
    }

    const activeEditor = await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument({
            language,
            content,
        })
    );

    if (maximize) {
        await vscode.commands.executeCommand("workbench.action.maximizeEditor");
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

    return { activeEditor, fileTree };
}

export type SelectionCommand =
    | "codeBlocks.selectBlock"
    | "codeBlocks.selectPrevious"
    | "codeBlocks.selectNext"
    | "codeBlocks.selectParent"
    | "codeBlocks.selectChild";

type TestSelectionCommandsParams = {
    language: SupportedTestLanguages;
    content: string;
    selectionCommands: SelectionCommand[];
    expectedSelectionContent: string;
    pause: number;
    maximize: boolean;
};

export async function testSelectionCommands({
    content,
    selectionCommands,
    expectedSelectionContent,
    language,
    pause,
    maximize = false,
}: TestSelectionCommandsParams): Promise<vscode.TextEditor> {
    const cursor = "@";
    const cursorIndex = content.indexOf(cursor);
    content = content.replace(cursor, "");
    const { activeEditor } = await openDocument({ language, content, maximize });
    activeEditor.selection = new vscode.Selection(
        activeEditor.document.positionAt(cursorIndex),
        activeEditor.document.positionAt(cursorIndex)
    );

    for (const command of selectionCommands) {
        await notify(`call '${command}' command`);
        await sleep(pause / 2);
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
    | "codeBlocks.moveUp"
    | "codeBlocks.moveUpForce"
    | "codeBlocks.moveDownForce";

export type TestMoveCommandsParams = {
    testSelectionParams: TestSelectionCommandsParams;
    moveCommands: MoveCommand[];
    expectedContent: string;
};
export async function testMoveCommands({
    testSelectionParams,
    moveCommands,
    expectedContent,
}: TestMoveCommandsParams): Promise<void> {
    const activeEditor = await testSelectionCommands(testSelectionParams);

    for (const command of moveCommands) {
        await vscode.commands.executeCommand(command);
    }

    const newContent = activeEditor.document.getText();
    const newSelectionContent = activeEditor.document.getText(activeEditor.selection);

    expect(newContent).to.equal(expectedContent, "move command didn't produce desired content");
    expect(newSelectionContent).to.equal(
        testSelectionParams.expectedSelectionContent,
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

    const activeEditor = await testSelectionCommands(testSelectionParams);

    for (const command of navigateCommands) {
        await vscode.commands.executeCommand(command);
    }

    const newCursorIndex = activeEditor.document.offsetAt(activeEditor.selection.active);

    const cleanContent = testSelectionParams.content.replace(/@/g, "");
    expect(newCursorIndex).to.equal(
        expectedNavigationDestinationIndex,
        "navigation commands didn't arrive to expected destination" +
            `\n\tactual: ${
                cleanContent.substring(0, newCursorIndex) +
                targetCursor +
                cleanContent.substring(newCursorIndex)
            }` +
            `\n\texpect: ${
                cleanContent.substring(0, expectedNavigationDestinationIndex) +
                targetCursor +
                cleanContent.substring(expectedNavigationDestinationIndex)
            }\n`
    );
}

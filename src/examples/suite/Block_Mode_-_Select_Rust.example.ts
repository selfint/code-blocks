import * as vscode from "vscode";
import { initExample, notify, openDocument, sleep, startRecording } from "../exampleUtils";
import { expect } from "chai";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "2m";
test("Block mode", async function () {
    await initExample();

    const { activeEditor } = await openDocument({
        language: "rust",
        content: "fn main() { let a = [1, 2@22, 3]; }",
        maximize: true,
        cursor: "@",
    });
    const selectionCommands = [
        "codeBlocks.selectBlock",
        "codeBlocks.selectNext",
        "codeBlocks.selectParent",
        "codeBlocks.selectChild",
    ];
    const expectedSelectionContent = "1";

    startRecording();

    for (const command of selectionCommands) {
        await notify(`call '${command}' command`);
        await sleep(2000);
        await vscode.commands.executeCommand(command);
        await sleep(2000);
    }
    const selectionContent = activeEditor.document.getText(activeEditor.selection);
    expect(selectionContent).to.equal(
        expectedSelectionContent,
        "selection commands didn't produce desired selection"
    );

    await sleep(1500);
}).timeout(TIMEOUT);

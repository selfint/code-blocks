// import * as assert from "assert";

import * as vscode from "vscode";

async function openDocument(content: string, language: string): Promise<void> {
    await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument({
            language,
            content,
        })
    );
}

suite("codeBlocks commands", function () {
    this.timeout("10h");
    suite(".open", function () {
        this.beforeAll(() => {
            return void vscode.window.showInformationMessage("Start code-blocks.open tests");
        });

        test("doesn't crash", async function () {
            await openDocument("fn main() {}", "rust");
            await vscode.commands.executeCommand("codeBlocks.open");
        });
    });
});

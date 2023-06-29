import * as vscode from "vscode";
import { CodeBlocksEditorProvider } from "../../editor/CodeBlocksEditorProvider";
import { assert } from "chai";

async function openDocument(content: string, language: string): Promise<void> {
    await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument({
            language,
            content,
        })
    );
}

suite("codeBlocks commands", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "2s");

    suite(".open", function () {
        this.beforeAll(() => {
            return void vscode.window.showInformationMessage("Start code-blocks.open tests");
        });

        test("Opens active tab with Code Blocks Editor", async function () {
            await openDocument("fn main() {}", "rust");
            await vscode.commands.executeCommand("codeBlocks.open");
            assert.equal(
                (vscode.window.tabGroups.activeTabGroup.activeTab?.input as { viewType: string }).viewType,
                CodeBlocksEditorProvider.viewType
            );
        });
    });
});

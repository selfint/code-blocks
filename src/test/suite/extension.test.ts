import * as vscode from "vscode";
import { assert, expect } from "chai";
import { CodeBlocksEditorProvider } from "../../editor/CodeBlocksEditorProvider";
import { TreeViewer } from "../../TreeViewer";

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

    suite(".openTreeViewer", function () {
        test("shows file tree", async () => {
            await openDocument("fn main() {}", "rust");
            await vscode.commands.executeCommand("codeBlocks.openTreeViewer");

            const treeViewerDocument = await vscode.workspace.openTextDocument(TreeViewer.uri);
            expect("\n" + treeViewerDocument.getText()).to.be.equal(`
source_file [0:0 - 0:12]
  function_item [0:0 - 0:12]
    identifier [0:3 - 0:7]
    parameters [0:7 - 0:9]
    block [0:10 - 0:12]`);
        });
    });
});

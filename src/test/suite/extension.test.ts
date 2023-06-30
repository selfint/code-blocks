import * as vscode from "vscode";
import { CodeBlocksEditorProvider } from "../../editor/CodeBlocksEditorProvider";
import { TreeViewer } from "../../TreeViewer";
import { expect } from "chai";

async function openDocument(content: string, language: string): Promise<vscode.TextEditor> {
    return await vscode.window.showTextDocument(
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
            expect(
                (vscode.window.tabGroups.activeTabGroup.activeTab?.input as { viewType: string }).viewType
            ).to.equal(CodeBlocksEditorProvider.viewType);
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

    suite(".moveUp", function () {
        test("moves selection up", async () => {
            const activeEditor = await openDocument("fn main() {} fn foo() { }", "rust");
            await vscode.commands.executeCommand("codeBlocks.toggle");

            activeEditor.selection = new vscode.Selection(
                new vscode.Position(0, 14),
                new vscode.Position(0, 23)
            );
            await vscode.commands.executeCommand("codeBlocks.moveUp");

            expect(activeEditor.document.getText()).to.equal("fn foo() { } fn main() {}");

            expect(false).to.be.true;
        });
    });
});

import * as vscode from "vscode";
import { activeFileTree, onActiveFileTreeChange } from "../../extension";
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

    async function awaitFileTreeLoaded(): Promise<void> {
        while (activeFileTree === undefined) {
            await new Promise<void>((r) => onActiveFileTreeChange.event(() => r()));
        }
    }

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
            await awaitFileTreeLoaded();

            const treeViewerDocument = await vscode.workspace.openTextDocument(TreeViewer.uri);
            expect("\n" + treeViewerDocument.getText()).to.be.equal(`
source_file [0:0 - 0:12]
  function_item [0:0 - 0:12]
    identifier [0:3 - 0:7]
    parameters [0:7 - 0:9]
    block [0:10 - 0:12]`);
        });
    });

    type TestMoveMethodParams = {
        content: string;
        selection: vscode.Selection;
        command: "codeBlocks.moveDown" | "codeBlocks.moveUp";
        expectedContent: string;
        expectedSelectionContent: string;
    };
    async function applyMoveMethod({
        content,
        selection,
        command,
        expectedContent,
        expectedSelectionContent,
    }: TestMoveMethodParams): Promise<void> {
        const activeEditor = await openDocument(content, "rust");
        await vscode.commands.executeCommand("codeBlocks.toggle");
        await awaitFileTreeLoaded();

        activeEditor.selection = selection;
        await vscode.commands.executeCommand(command);

        const newContent = activeEditor.document.getText();
        const newSelectionContent = activeEditor.document.getText(activeEditor.selection);

        expect(newContent).to.equal(expectedContent);
        expect(newSelectionContent).to.equal(expectedSelectionContent);
    }

    suite(".moveUp", function () {
        test("move methods", async () => {
            await applyMoveMethod({
                content: "fn main() {} fn foo() { }",
                selection: new vscode.Selection(new vscode.Position(0, 14), new vscode.Position(0, 23)),
                command: "codeBlocks.moveUp",
                expectedContent: "fn foo() { } fn main() {}",
                expectedSelectionContent: "fn foo() { }",
            });
        });
    });

    suite(".moveDown", function () {
        test("moves selection down and updates selection", async () => {
            await applyMoveMethod({
                content: "fn main() { }\nfn f() { }",
                selection: new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 10)),
                command: "codeBlocks.moveDown",
                expectedContent: "fn f() { }\nfn main() { }",
                expectedSelectionContent: "fn main() { }",
            });
        });
    });

    suite("repeat moves", function () {
        test("move down/up returns to original", async () => {
            const activeEditor = await openDocument("fn main() { }\nfn f() { }", "rust");
            void vscode.commands.executeCommand("codeBlocks.toggle");
            await awaitFileTreeLoaded();

            activeEditor.selection = new vscode.Selection(
                new vscode.Position(0, 1),
                new vscode.Position(0, 10)
            );

            await vscode.commands.executeCommand("codeBlocks.moveDown");
            await vscode.commands.executeCommand("codeBlocks.moveUp");

            expect(activeEditor.document.getText()).to.equal("fn main() { }\nfn f() { }");
            expect(activeEditor.document.getText(activeEditor.selection)).to.equal("fn main() { }");
        });

        test("moving without awaiting is stable", async () => {
            const activeEditor = await openDocument("fn main() { }\nfn f() { }", "rust");
            void vscode.commands.executeCommand("codeBlocks.toggle");
            await awaitFileTreeLoaded();

            activeEditor.selection = new vscode.Selection(
                new vscode.Position(0, 1),
                new vscode.Position(0, 10)
            );

            for (let i = 0; i < 100; i++) {
                await Promise.all([
                    vscode.commands.executeCommand("codeBlocks.moveDown"),
                    vscode.commands.executeCommand("codeBlocks.moveDown"),
                    vscode.commands.executeCommand("codeBlocks.moveUp"),
                    vscode.commands.executeCommand("codeBlocks.moveUp"),
                ]);
            }

            // which moves happen first is undefined, but result should
            // be either of these
            expect(activeEditor.document.getText()).to.be.oneOf([
                "fn main() { }\nfn f() { }",
                "fn f() { }\nfn main() { }",
            ]);
            expect(activeEditor.document.getText(activeEditor.selection)).to.equal("fn main() { }");
        }).timeout(process.env.TEST_TIMEOUT ?? "1m");
    });
});

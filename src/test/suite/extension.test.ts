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

    suite("Move/Select commands", function () {
        type TestMoveMethodParams = {
            content: string;
            selectionCommands: (
                | "codeBlocks.selectPrevious"
                | "codeBlocks.selectNext"
                | "codeBlocks.selectParent"
            )[];
            moveCommands: ("codeBlocks.moveDown" | "codeBlocks.moveUp")[];
            expectedContent: string;
            expectedSelectionContent: string;
        };
        async function testsCommands({
            content,
            selectionCommands,
            moveCommands,
            expectedContent,
            expectedSelectionContent,
        }: TestMoveMethodParams): Promise<void> {
            const cursor = "@";
            const cursorIndex = content.indexOf(cursor);
            content = content.replace(cursor, "");
            const activeEditor = await openDocument(content, "rust");
            await vscode.commands.executeCommand("codeBlocks.toggle");
            await awaitFileTreeLoaded();
            activeEditor.selection = new vscode.Selection(
                activeEditor.document.positionAt(cursorIndex),
                activeEditor.document.positionAt(cursorIndex)
            );
            await vscode.commands.executeCommand("codeBlocks.startSelection");

            for (const command of selectionCommands) {
                await vscode.commands.executeCommand(command);
            }

            const selectionContent = activeEditor.document.getText(activeEditor.selection);
            expect(selectionContent).to.equal(
                expectedSelectionContent,
                "selection commands didn't produce desired selection"
            );

            for (const command of moveCommands) {
                await vscode.commands.executeCommand(command);
            }

            const newContent = activeEditor.document.getText();
            const newSelectionContent = activeEditor.document.getText(activeEditor.selection);

            expect(newContent).to.equal(expectedContent, "move command didn't produce desired content");
            expect(newSelectionContent).to.equal(
                expectedSelectionContent,
                "move command didn't preserve selection content"
            );
        }

        suite(".moveUp", function () {
            test.only("moves selection up and updates selection", async () => {
                await testsCommands({
                    content: "fn main() {} fn foo() { @}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    moveCommands: ["codeBlocks.moveUp"],
                    expectedContent: "fn foo() { } fn main() {}",
                    expectedSelectionContent: "fn foo() { }",
                });
            });
        });

        suite(".moveDown", function () {
            test("moves selection down and updates selection", async () => {
                // await testsCommands({
                //     content: "fn main() { }\nfn f() { }",
                //     selection: new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 10)),
                //     moveCommands: ["codeBlocks.moveDown"],
                //     expectedContent: "fn f() { }\nfn main() { }",
                //     expectedSelectionContent: "fn main() { }",
                // });
            });
        });

        suite("repeat moves", function () {
            test("move down/up returns to original", async () => {
                // await testsCommands({
                //     content: "fn main() { }\nfn f() { }",
                //     selection: new vscode.Selection(new vscode.Position(0, 1), new vscode.Position(0, 10)),
                //     moveCommands: ["codeBlocks.moveDown", "codeBlocks.moveUp"],
                //     expectedContent: "fn main() { }\nfn f() { }",
                //     expectedSelectionContent: "fn main() { }",
                // });
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
});

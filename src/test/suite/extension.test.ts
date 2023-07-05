import * as vscode from "vscode";
import { SupportedTestLanguages, openDocument } from "./testUtils";
import { CodeBlocksEditorProvider } from "../../editor/CodeBlocksEditorProvider";
import { TreeViewer } from "../../TreeViewer";
import { expect } from "chai";

suite("codeBlocks commands", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "2s");

    type SelectionCommand =
        | "codeBlocks.selectBlock"
        | "codeBlocks.selectPrevious"
        | "codeBlocks.selectNext"
        | "codeBlocks.selectParent"
        | "codeBlocks.selectChild";

    async function testSelectionCommands({
        content,
        selectionCommands,
        expectedSelectionContent,
        language = "rust",
    }: {
        content: string;
        selectionCommands: SelectionCommand[];
        expectedSelectionContent: string;
        language?: SupportedTestLanguages;
    }): Promise<vscode.TextEditor> {
        const cursor = "@";
        const cursorIndex = content.indexOf(cursor);
        content = content.replace(cursor, "");
        const { activeEditor } = await openDocument(content, language);
        activeEditor.selection = new vscode.Selection(
            activeEditor.document.positionAt(cursorIndex),
            activeEditor.document.positionAt(cursorIndex)
        );

        for (const command of selectionCommands) {
            await vscode.commands.executeCommand(command);
        }

        const selectionContent = activeEditor.document.getText(activeEditor.selection);
        expect(selectionContent).to.equal(
            expectedSelectionContent,
            "selection commands didn't produce desired selection"
        );

        return activeEditor;
    }

    type MoveCommand =
        | "codeBlocks.moveDown"
        | "codeBlocks.moveUp"
        | "codeBlocks.moveUpForce"
        | "codeBlocks.moveDownForce";

    type TestMoveCommandsParams = {
        content: string;
        selectionCommands: SelectionCommand[];
        moveCommands: MoveCommand[];
        expectedContent: string;
        expectedSelectionContent: string;
        language: SupportedTestLanguages;
    };
    async function testMoveCommands({
        content,
        selectionCommands,
        moveCommands,
        expectedContent,
        expectedSelectionContent,
        language,
    }: TestMoveCommandsParams): Promise<void> {
        const activeEditor = await testSelectionCommands({
            content,
            selectionCommands,
            expectedSelectionContent,
            language,
        });

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

    type NavigationCommand =
        | "codeBlocks.navigateDown"
        | "codeBlocks.navigateUp"
        | "codeBlocks.navigateUpForce"
        | "codeBlocks.navigateDownForce";

    type TestNavigationCommandsParams = {
        content: string;
        selectionCommands: SelectionCommand[];
        navigateCommands: NavigationCommand[];
        expectedSelectionContent: string;
        language: SupportedTestLanguages;
    };
    async function testNavigateCommands({
        content,
        selectionCommands,
        navigateCommands: moveCommands,
        expectedSelectionContent,
        language,
    }: TestNavigationCommandsParams): Promise<void> {
        const targetCursor = "#";
        const expectedNavigationDestinationIndex = content.replace(/@/g, "").indexOf(targetCursor);
        content = content.replace(targetCursor, "");

        const activeEditor = await testSelectionCommands({
            content,
            selectionCommands,
            expectedSelectionContent,
            language,
        });

        for (const command of moveCommands) {
            await vscode.commands.executeCommand(command);
        }

        const newCursorIndex = activeEditor.document.offsetAt(activeEditor.selection.active);

        const cleanContent = content.replace(/@/g, "");
        expect(newCursorIndex).to.equal(
            expectedNavigationDestinationIndex,
            "navigation commands didn't arrive to expected destination" +
                `\n\tactual: ${
                    cleanContent.substring(0, newCursorIndex) + "#" + cleanContent.substring(newCursorIndex)
                }` +
                `\n\texpect: ${
                    cleanContent.substring(0, expectedNavigationDestinationIndex) +
                    "#" +
                    cleanContent.substring(expectedNavigationDestinationIndex)
                }\n`
        );
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
            const treeViewerDocument = await vscode.workspace.openTextDocument(TreeViewer.uri);
            while (treeViewerDocument.getText() === TreeViewer.placeholder) {
                await new Promise<void>((r) => TreeViewer.treeViewer.onDidChange(() => r()));
            }

            expect("\n" + treeViewerDocument.getText()).to.be.equal(`
source_file [0:0 - 0:12]
  function_item [0:0 - 0:12]
    identifier [0:3 - 0:7]
    parameters [0:7 - 0:9]
    block [0:10 - 0:12]`);
        });
    });

    suite("Select commands", function () {
        suite(".selectBlock", function () {
            test("expands to current node", async () => {
                await testSelectionCommands({
                    content: "fn main() { let a = [1, 2@22, 3]; }",
                    selectionCommands: ["codeBlocks.selectBlock"],
                    expectedSelectionContent: "222",
                });
            });
        });

        suite(".selectParent", function () {
            test("selects parent", async () => {
                await testSelectionCommands({
                    content: "fn main() { pub fn foo() { @ } }",
                    selectionCommands: [
                        "codeBlocks.selectParent",
                        "codeBlocks.selectParent",
                        "codeBlocks.selectParent",
                    ],
                    expectedSelectionContent: "fn main() { pub fn foo() {  } }",
                });
            });
        });

        suite(".selectPrevious", function () {
            test("selects previous", async () => {
                await testSelectionCommands({
                    content: "<> <p>@a</p> </>",
                    selectionCommands: ["codeBlocks.selectPrevious"],
                    expectedSelectionContent: "<p>a",
                    language: "typescriptreact",
                });
            });
        });

        suite(".selectChild", function () {
            test("contracts to first named child", async () => {
                await testSelectionCommands({
                    content: "pub fn foo() { @ }",
                    selectionCommands: ["codeBlocks.selectParent", "codeBlocks.selectChild"],
                    expectedSelectionContent: "pub",
                });
                await testSelectionCommands({
                    content: "if true { @ }",
                    selectionCommands: ["codeBlocks.selectParent", "codeBlocks.selectChild"],
                    expectedSelectionContent: "true",
                });
            });
        });
    });

    suite("Move commands", function () {
        suite(".moveUp", function () {
            test.only("moves selection up and updates selection", async () => {
                await testMoveCommands({
                    content: "fn main() {} fn foo() { @}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    moveCommands: ["codeBlocks.moveUp"],
                    expectedContent: "fn foo() { } fn main() {}",
                    expectedSelectionContent: "fn foo() { }",
                    language: "rust",
                });
                await testMoveCommands({
                    content: "function main() {\nlet a = 1;\nlet b = 2;\nlet c = @3;}",
                    selectionCommands: ["codeBlocks.selectParent", "codeBlocks.selectParent"],
                    moveCommands: ["codeBlocks.moveUp"],
                    expectedContent: "function main() {\nlet a = 1;\nlet c = 3;\nlet b = 2;}",
                    expectedSelectionContent: "let c = 3;",
                    language: "typescriptreact",
                });
            });

            test("moves block up and updates selection", async () => {
                await testMoveCommands({
                    content: "fn main() {}\n// doc comment\nfn foo() { @}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    moveCommands: ["codeBlocks.moveUp"],
                    expectedContent: "// doc comment\nfn foo() { }\nfn main() {}",
                    expectedSelectionContent: "// doc comment\nfn foo() { }",
                    language: "rust",
                });
            });

            test("multiple nodes selected", async () => {
                await testMoveCommands({
                    content: "fn main() { let a = [1, 2, @3, 4, 5]; }",
                    selectionCommands: ["codeBlocks.selectPrevious"],
                    moveCommands: ["codeBlocks.moveUp"],
                    expectedContent: "fn main() { let a = [2, 3, 1, 4, 5]; }",
                    expectedSelectionContent: "2, 3",
                    language: "rust",
                });
            });
        });

        suite(".moveDown", function () {
            test("moves selection down and updates selection", async () => {
                await testMoveCommands({
                    content: "fn main() {@} fn foo() {}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    moveCommands: ["codeBlocks.moveDown"],
                    expectedContent: "fn foo() {} fn main() {}",
                    expectedSelectionContent: "fn main() {}",
                    language: "rust",
                });
            });

            test("multiple nodes selected", async () => {
                await testMoveCommands({
                    content: "fn main() { let a = [1, 2, @3, 4, 5]; }",
                    selectionCommands: ["codeBlocks.selectNext"],
                    moveCommands: ["codeBlocks.moveDown"],
                    expectedContent: "fn main() { let a = [1, 2, 5, 3, 4]; }",
                    expectedSelectionContent: "3, 4",
                    language: "rust",
                });
                await testMoveCommands({
                    content: "fn main() { let a = [1, @2, 3]; }",
                    selectionCommands: ["codeBlocks.selectPrevious"],
                    moveCommands: ["codeBlocks.moveDown"],
                    expectedContent: "fn main() { let a = [3, 1, 2]; }",
                    expectedSelectionContent: "1, 2",
                    language: "rust",
                });
            });
        });

        suite(".moveUpForce", function () {
            test("moves selection up and updates selection", async () => {
                await testMoveCommands({
                    content: "fn main() { { let a = 1@; }}",
                    selectionCommands: ["codeBlocks.selectBlock"],
                    moveCommands: ["codeBlocks.moveUpForce"],
                    expectedContent: "fn main() { let a = 1;{  }}",
                    expectedSelectionContent: "let a = 1;",
                    language: "rust",
                });
            });

            test("multiple nodes selected", async () => {
                await testMoveCommands({
                    content: "fn main() { { let a = 1@; let b = 2; }}",
                    selectionCommands: ["codeBlocks.selectNext"],
                    moveCommands: ["codeBlocks.moveUpForce"],
                    expectedContent: "fn main() { let a = 1; let b = 2;{  }}",
                    expectedSelectionContent: "let a = 1; let b = 2;",
                    language: "rust",
                });
            });
        });

        suite(".moveDownForce", function () {
            test("moves selection up and updates selection", async () => {
                await testMoveCommands({
                    content: "fn main() { { let a = 1@; }}",
                    selectionCommands: ["codeBlocks.selectBlock"],
                    moveCommands: ["codeBlocks.moveDownForce"],
                    expectedContent: "fn main() { {  }let a = 1;}",
                    expectedSelectionContent: "let a = 1;",
                    language: "rust",
                });
            });

            test("multiple nodes selected", async () => {
                await testMoveCommands({
                    content: "fn main() { { let a = 1@; let b = 2; }}",
                    selectionCommands: ["codeBlocks.selectNext"],
                    moveCommands: ["codeBlocks.moveDownForce"],
                    expectedContent: "fn main() { {  }let a = 1; let b = 2;}",
                    expectedSelectionContent: "let a = 1; let b = 2;",
                    language: "rust",
                });
            });
        });

        suite("repeat moves", function () {
            test("move down/up returns to original", async () => {
                await testMoveCommands({
                    content: "fn main() {@}\nfn f() {}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    moveCommands: ["codeBlocks.moveDown", "codeBlocks.moveUp"],
                    expectedContent: "fn main() {}\nfn f() {}",
                    expectedSelectionContent: "fn main() {}",
                    language: "rust",
                });
            });

            test("moving without awaiting is stable", async () => {
                const activeEditor = await testSelectionCommands({
                    content: "fn main() {@} fn f() {}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    expectedSelectionContent: "fn main() {}",
                });

                // this will produce a lot of pointless logs, so we silence them for a bit
                const oldDebug = console.debug;
                console.debug = (_message?: unknown, ..._optionalParams: unknown[]): void => {
                    /** */
                };
                for (let i = 0; i < 100; i++) {
                    await Promise.all([
                        vscode.commands.executeCommand("codeBlocks.moveDown"),
                        vscode.commands.executeCommand("codeBlocks.moveDown"),
                        vscode.commands.executeCommand("codeBlocks.moveUp"),
                        vscode.commands.executeCommand("codeBlocks.moveUp"),
                    ]);
                }

                console.debug = oldDebug;

                // which moves happen first is undefined, but result should
                // be either of these
                expect(activeEditor.document.getText()).to.be.oneOf([
                    "fn main() {} fn f() {}",
                    "fn f() {} fn main() {}",
                ]);
                expect(activeEditor.document.getText(activeEditor.selection)).to.equal("fn main() {}");
            }).timeout(process.env.TEST_TIMEOUT ?? "1m");
        });
    });

    suite("Navigate commands", function () {
        suite(".navigateUp", function () {
            test("navigates to previous", async () => {
                await testNavigateCommands({
                    content: "#fn main() {} fn foo() { @}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    navigateCommands: ["codeBlocks.navigateUp"],
                    expectedSelectionContent: "fn foo() { }",
                    language: "rust",
                });
            });

            test("multiple nodes selected", async () => {
                await testNavigateCommands({
                    content: "fn main() { let a = [#1, 2, @3, 4, 5]; }",
                    selectionCommands: ["codeBlocks.selectPrevious"],
                    navigateCommands: ["codeBlocks.navigateUp"],
                    expectedSelectionContent: "2, 3",
                    language: "rust",
                });
            });
        });

        suite(".navigateDown", function () {
            test("navigates to next", async () => {
                await testNavigateCommands({
                    content: "fn main() {@} #fn foo() {}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    navigateCommands: ["codeBlocks.navigateDown"],
                    expectedSelectionContent: "fn main() {}",
                    language: "rust",
                });
            });

            test("multiple nodes selected", async () => {
                await testNavigateCommands({
                    content: "fn main() { let a = [1, 2, @3, 4, #5]; }",
                    selectionCommands: ["codeBlocks.selectNext"],
                    navigateCommands: ["codeBlocks.navigateDown"],
                    expectedSelectionContent: "3, 4",
                    language: "rust",
                });
                await testNavigateCommands({
                    content: "fn main() { let a = [1, @2, #3]; }",
                    selectionCommands: ["codeBlocks.selectPrevious"],
                    navigateCommands: ["codeBlocks.navigateDown"],
                    expectedSelectionContent: "1, 2",
                    language: "rust",
                });
            });
        });

        suite(".navigateUpForce", function () {
            test("navigates to parent start", async () => {
                await testNavigateCommands({
                    content: "fn main() { #{ let a = 1@; }}",
                    selectionCommands: ["codeBlocks.selectBlock"],
                    navigateCommands: ["codeBlocks.navigateUpForce"],
                    expectedSelectionContent: "let a = 1;",
                    language: "rust",
                });
            });

            test("multiple nodes selected", async () => {
                await testNavigateCommands({
                    content: "fn main() { #{ let a = 1@; let b = 2; }}",
                    selectionCommands: ["codeBlocks.selectNext"],
                    navigateCommands: ["codeBlocks.navigateUpForce"],
                    expectedSelectionContent: "let a = 1; let b = 2;",
                    language: "rust",
                });
            });
        });

        suite(".navigateDownForce", function () {
            test("navigates to parent end", async () => {
                await testNavigateCommands({
                    content: "fn main() { { let a = 1@; }#}",
                    selectionCommands: ["codeBlocks.selectBlock"],
                    navigateCommands: ["codeBlocks.navigateDownForce"],
                    expectedSelectionContent: "let a = 1;",
                    language: "rust",
                });
            });

            test("multiple nodes selected", async () => {
                await testNavigateCommands({
                    content: "fn main() { { let a = 1@; let b = 2; }#}",
                    selectionCommands: ["codeBlocks.selectNext"],
                    navigateCommands: ["codeBlocks.navigateDownForce"],
                    expectedSelectionContent: "let a = 1; let b = 2;",
                    language: "rust",
                });
            });
        });

        suite("repeat navigates", function () {
            test("navigate down/up returns to original", async () => {
                await testNavigateCommands({
                    content: "#fn main() {@}\nfn f() {}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    navigateCommands: ["codeBlocks.navigateDown", "codeBlocks.navigateUp"],
                    expectedSelectionContent: "fn main() {}",
                    language: "rust",
                });
            });

            test("navigating without awaiting is stable", async () => {
                const activeEditor = await testSelectionCommands({
                    content: "fn main() {@} fn f() {}",
                    selectionCommands: ["codeBlocks.selectParent"],
                    expectedSelectionContent: "fn main() {}",
                });

                // this will produce a lot of pointless logs, so we silence them for a bit
                const oldDebug = console.debug;
                console.debug = (_message?: unknown, ..._optionalParams: unknown[]): void => {
                    /** */
                };
                for (let i = 0; i < 100; i++) {
                    await Promise.all([
                        vscode.commands.executeCommand("codeBlocks.navigateDown"),
                        vscode.commands.executeCommand("codeBlocks.navigateDown"),
                        vscode.commands.executeCommand("codeBlocks.navigateUp"),
                        vscode.commands.executeCommand("codeBlocks.navigateUp"),
                    ]);
                }

                console.debug = oldDebug;

                // which moves happen first is undefined, but result should
                // be either of these
                expect(activeEditor.document.offsetAt(activeEditor.selection.active)).to.be.oneOf([
                    "#fn main() {} fn f() {}".indexOf("#"),
                    "fn main() {} #fn f() {}".indexOf("#"),
                ]);
            }).timeout(process.env.TEST_TIMEOUT ?? "1m");
        });
    });
});

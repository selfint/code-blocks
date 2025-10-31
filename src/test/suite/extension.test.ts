import * as vscode from "vscode";
import { CodeBlocksEditorProvider } from "../../editor/CodeBlocksEditorProvider";
import { TreeViewer } from "../../TreeViewer";
import { expect } from "chai";
import { openDocument } from "./testUtils";

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
        expectedSelectionContent: string | string[];
        language?: string;
    }): Promise<vscode.TextEditor> {
        if (typeof expectedSelectionContent === "string") {
            expectedSelectionContent = [expectedSelectionContent];
        }

        const cursor = "@";
        const selections = [];
        let cursorIndex = content.indexOf(cursor);
        while (cursorIndex > -1) {
            content = content.replace(cursor, "");
            selections.push(cursorIndex);
            cursorIndex = content.indexOf(cursor);
        }

        const { activeEditor } = await openDocument(content, language);
        activeEditor.selections = selections.map(
            (cursorIndex) =>
                new vscode.Selection(
                    activeEditor.document.positionAt(cursorIndex),
                    activeEditor.document.positionAt(cursorIndex)
                )
        );

        for (const command of selectionCommands) {
            await vscode.commands.executeCommand(command);
        }

        const selectionContent = activeEditor.selections
            .map((s) => activeEditor.document.getText(s))
            .join("\n--\n");

        expect(selectionContent).to.equal(
            expectedSelectionContent.join("\n--\n"),
            "selection commands didn't produce desired selection"
        );

        return activeEditor;
    }

    type MoveCommand = "codeBlocks.moveDown" | "codeBlocks.moveUp";

    type TestMoveCommandsParams = {
        content: string;
        selectionCommands: SelectionCommand[];
        moveCommands: MoveCommand[];
        expectedContent: string;
        expectedSelectionContent: string | string[];
        language: string;
    };
    async function testMoveCommands({
        content,
        selectionCommands,
        moveCommands,
        expectedContent,
        expectedSelectionContent,
        language,
    }: TestMoveCommandsParams): Promise<void> {
        if (typeof expectedSelectionContent === "string") {
            expectedSelectionContent = [expectedSelectionContent];
        }

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
        const newSelectionContent = activeEditor.selections
            .map((s) => activeEditor.document.getText(s))
            .join("\n--\n");

        expect(newContent).to.equal(expectedContent, "move command didn't produce desired content");
        expect(newSelectionContent).to.equal(
            expectedSelectionContent.join("\n--\n"),
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
        expectedSelectionContent: string | string[];
        language: string;
    };
    async function testNavigateCommands({
        content,
        selectionCommands,
        navigateCommands,
        expectedSelectionContent,
        language,
    }: TestNavigationCommandsParams): Promise<void> {
        const expectedCursorLocations = content.replace(/@/g, "");
        const targetCursor = "#";
        expect(expectedCursorLocations.indexOf(targetCursor)).not.to.equal(
            -1,
            `target cursor '${targetCursor}' missing from input:\n${content}\n\n`
        );
        content = content.replace(/#/g, "");

        const activeEditor = await testSelectionCommands({
            content,
            selectionCommands,
            expectedSelectionContent,
            language,
        });

        for (const command of navigateCommands) {
            await vscode.commands.executeCommand(command);
        }

        let actualCursorLocations = content.replace(/@/g, "");
        const newCursorIndices = activeEditor.selections.map(({ active }) => active.character);

        for (let i = 0; i < newCursorIndices.length; i++) {
            const index = newCursorIndices[i] + i;

            actualCursorLocations =
                actualCursorLocations.substring(0, index) +
                targetCursor +
                actualCursorLocations.substring(index);
        }

        expect(actualCursorLocations).to.equal(
            expectedCursorLocations,
            "navigation commands didn't arrive to expected destination"
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

            test("expands to current block", async () => {
                await testSelectionCommands({
                    content: "#[attr]\nstruct A { @ }",
                    selectionCommands: ["codeBlocks.selectParent"],
                    expectedSelectionContent: "#[attr]\nstruct A {  }",
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
            test("moves selection up and updates selection", async () => {
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

            test("navigates to next block", async () => {
                await testNavigateCommands({
                    content: "struct A;\n// b\nstruct @B;\n#// c\nstruct C;",
                    selectionCommands: ["codeBlocks.selectParent"],
                    navigateCommands: ["codeBlocks.navigateDown"],
                    expectedSelectionContent: "// b\nstruct B;",
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

    suite("Multiple cursor commands", function () {
        suite(".selectBlock", function () {
            test("supports multi-cursor", async function () {
                await testSelectionCommands({
                    content: "function @a(){}\nfunction b(){}\nfunction @c(){}",
                    selectionCommands: ["codeBlocks.selectBlock"],
                    expectedSelectionContent: ["a", "c"],
                    language: "typescript",
                });
            });
        });

        suite(".selectNext", function () {
            test("updates each selection independently", async function () {
                await testSelectionCommands({
                    content: "function @a(){}\nfunction b(){}\nfunction @c(){}",
                    selectionCommands: ["codeBlocks.selectBlock", "codeBlocks.selectNext"],
                    expectedSelectionContent: ["a()", "c()"],
                    language: "typescript",
                });
            });
        });

        suite(".navigateDown", function () {
            test("moves cursors to next siblings", async function () {
                await testNavigateCommands({
                    content: "let @a, @#b, #c;",
                    selectionCommands: ["codeBlocks.selectBlock"],
                    navigateCommands: ["codeBlocks.navigateDown"],
                    expectedSelectionContent: ["a", "b"],
                    language: "typescript",
                });
            });
        });

        suite(".moveDown", function () {
            test("swaps each selected element with its next sibling", async function () {
                await testMoveCommands({
                    content: "fn main() { let a = [@1, 2, @3]; }",
                    selectionCommands: ["codeBlocks.selectBlock"],
                    moveCommands: ["codeBlocks.moveDown"],
                    expectedContent: "fn main() { let a = [2, 1, 3]; }",
                    expectedSelectionContent: ["1", "3"],
                    language: "rust",
                });
            });

            test.only("respects query-generated blocks", async function () {
                await testMoveCommands({
                    content: `\
pub struct RustStruct {
    f1: i@32,
    f2: i@32,
    #[trait]
    f3: i32,
}`,
                    selectionCommands: ["codeBlocks.selectBlock", "codeBlocks.selectParent"],
                    moveCommands: ["codeBlocks.moveDown"],
                    expectedContent: `\
pub struct RustStruct {
    #[trait]
    f3: i32,
    f1: i32,
    f2: i32,
}`,
                    expectedSelectionContent: ["f1: i32", "f2: i32"],
                    language: "rust",
                });
            });
        });
    });
});

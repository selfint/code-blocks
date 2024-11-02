import * as vscode from "vscode";
import { FileTree, MoveSelectionDirection } from "../../FileTree";
import { openDocument } from "./testUtils";
import { Selection } from "../../Selection";
import assert from "assert";
import { expect } from "chai";

suite("FileTree", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "2s");

    async function testResolveVscodeSelection({
        language,
        content,
        expectedSelectionText,
    }: {
        language: string;
        content: string;
        expectedSelectionText: string | undefined;
    }): Promise<[Selection, FileTree]> {
        const cursor = "@";
        const selectionStart = content.indexOf(cursor);
        content = content.replace(cursor, "");
        const selectionEnd = content.indexOf(cursor);
        content = content.replace(cursor, "");

        const { fileTree } = await openDocument(content, language);
        const vscodeSelection = new vscode.Selection(
            fileTree.document.positionAt(selectionStart),
            fileTree.document.positionAt(selectionEnd)
        );
        const selection = fileTree.resolveVscodeSelection(vscodeSelection);

        assert.ok(selection, "selection was undefined");
        expect(selection.getText(content)).to.equal(
            expectedSelectionText,
            `Initial selection content: ${(await vscode.workspace.openTextDocument({ content })).getText(
                vscodeSelection
            )}`
        );

        return [selection, fileTree];
    }

    async function testMoveSelection({
        language,
        content,
        direction,
        expectedContent,
        expectedSelectionContent,
    }: {
        language: string;
        content: string;
        direction: MoveSelectionDirection;
        expectedContent: string;
        expectedSelectionContent: string;
    }): Promise<void> {
        const [selection, fileTree] = await testResolveVscodeSelection({
            language,
            content,
            expectedSelectionText: expectedSelectionContent,
        });

        const result = await fileTree.moveSelection(selection, direction);

        expect(result.status).to.equal("ok");
        expect(fileTree.document.getText()).to.equal(expectedContent, "move didn't create expected content");
        // @ts-expect-error result is ok, checked 2 lines before
        expect(fileTree.document.getText(result.result)).to.equal(
            expectedSelectionContent,
            "move didn't preserve selection"
        );
    }

    async function testTeleport({
        language,
        content,
        expectedContent,
        expectedSelectionContent,
        expectedTargetContent,
    }: {
        language: string;
        content: string;
        expectedContent: string;
        expectedSelectionContent: string;
        expectedTargetContent: string;
    }): Promise<void> {
        const cursorRegexp = /@/g;
        const targetCursor = "#";
        const targetStart = content.replace(cursorRegexp, "").indexOf(targetCursor);
        content = content.replace(targetCursor, "");
        const targetEnd = content.replace(cursorRegexp, "").indexOf(targetCursor);
        content = content.replace(targetCursor, "");
        const [selection, fileTree] = await testResolveVscodeSelection({
            language,
            content,
            expectedSelectionText: expectedSelectionContent,
        });

        const targetVscodeSelection = new vscode.Selection(
            fileTree.document.positionAt(targetStart),
            fileTree.document.positionAt(targetEnd)
        );
        const targetSelection = fileTree.resolveVscodeSelection(targetVscodeSelection);

        assert.ok(targetSelection, "selection was undefined");
        expect(targetSelection.getText(content.replace(cursorRegexp, ""))).to.equal(
            expectedTargetContent,
            `Initial target selection content: ${fileTree.document.getText(targetVscodeSelection)}`
        );

        const result = await fileTree.teleportSelection(selection, targetSelection, []);

        expect(result.status).to.equal("ok");
        expect(fileTree.document.getText()).to.equal(
            expectedContent,
            "teleport didn't create expected content"
        );
        // @ts-expect-error result is ok, checked 2 lines before
        expect(fileTree.document.getText(result.result)).to.equal(
            expectedSelectionContent,
            "teleport didn't preserve selection"
        );
    }

    async function testTreeUpdatesAfterEdit({
        language,
        initialContent,
        expectedInitialTree,
        finalContent,
        expectedFinalTree,
    }: {
        language: string;
        initialContent: string;
        expectedInitialTree: string;
        finalContent: string;
        expectedFinalTree: string;
    }): Promise<void> {
        const { fileTree } = await openDocument(initialContent, language);
        expect("\n" + fileTree.toString()).to.equal(expectedInitialTree, "initial tree didn't match");

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            fileTree.document.uri,
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, initialContent.length)),
            finalContent
        );
        await vscode.workspace.applyEdit(edit);

        expect("\n" + fileTree.toString()).to.equal(expectedFinalTree, "expected final tree didn't match");
    }

    suite(".update", function () {
        test("updates tree after edit", async () => {
            await testTreeUpdatesAfterEdit({
                language: "rust",
                initialContent: "fn main() {}",
                finalContent: "struct A;",
                expectedInitialTree: `
source_file [0:0 - 0:12]
  function_item [0:0 - 0:12]
    identifier [0:3 - 0:7]
    parameters [0:7 - 0:9]
    block [0:10 - 0:12]`,
                expectedFinalTree: `
source_file [0:0 - 0:9]
  struct_item [0:0 - 0:9]
    type_identifier [0:7 - 0:8]`,
            });

            await testTreeUpdatesAfterEdit({
                language: "typescriptreact",
                initialContent: "function main() {}",
                finalContent: "class A {}",
                expectedInitialTree: `
program [0:0 - 0:18]
  function_declaration [0:0 - 0:18]
    identifier [0:9 - 0:13]
    formal_parameters [0:13 - 0:15]
    statement_block [0:16 - 0:18]`,
                expectedFinalTree: `
program [0:0 - 0:10]
  class_declaration [0:0 - 0:10]
    type_identifier [0:6 - 0:7]
    class_body [0:8 - 0:10]`,
            });
        });
    });

    suite(".resolveVscodeSelection", () => {
        test("is node when selection is node range", async () => {
            await testResolveVscodeSelection({
                language: "rust",
                content: "fn main() { @let a = 1;@ let b = 2; }",
                expectedSelectionText: "let a = 1;",
            });

            await testResolveVscodeSelection({
                language: "typescriptreact",
                content: "function main() { return (<> <p>@a@</p> <p>b</p> </>); }",
                expectedSelectionText: "a",
            });
        });

        test("expands to node when range within node range", async () => {
            await testResolveVscodeSelection({
                language: "rust",
                content: "fn main() { let a @= @1; let b = 2; }",
                expectedSelectionText: "let a = 1;",
            });

            await testResolveVscodeSelection({
                language: "typescriptreact",
                content: "function main() { return (<> @<p@>a</p> <p>b</p> </>); }",
                expectedSelectionText: "<p>",
            });
        });

        test("is multiple nodes when range is multiple nodes range", async () => {
            await testResolveVscodeSelection({
                language: "rust",
                content: "fn main() { @let a = 1; let b = 2;@ }",
                expectedSelectionText: "let a = 1; let b = 2;",
            });

            await testResolveVscodeSelection({
                language: "typescriptreact",
                content: "function main() { return (<> @<p>a</p>@ <p>b</p> </>); }",
                expectedSelectionText: "<p>a</p>",
            });
        });

        test("is multiple nodes when range within multiple nodes ranges", async () => {
            await testResolveVscodeSelection({
                language: "rust",
                content: "fn main() { let @a = 1; let@ b = 2; }",
                expectedSelectionText: "let a = 1; let b = 2;",
            });

            await testResolveVscodeSelection({
                language: "typescriptreact",
                content: "function main() { return (<> <p@>a</p@> <p>b</p> </>); }",
                expectedSelectionText: "<p>a</p>",
            });
        });

        test("expands scope when selection crosses node parent range", async () => {
            await testResolveVscodeSelection({
                language: "rust",
                content: "fn main() { fn foo() { let a@ = 1; } let @b = 2; }",
                expectedSelectionText: "fn foo() { let a = 1; } let b = 2;",
            });

            await testResolveVscodeSelection({
                language: "typescriptreact",
                content: "function main() { return (<> <p>a@</p> <p>b@</p> </>); }",
                expectedSelectionText: "<p>a</p> <p>b</p>",
            });
        });
    });

    suite(".moveSelection", function () {
        suite("swap-previous", function () {
            test("single node selection", async () => {
                await testMoveSelection({
                    language: "rust",
                    content: "fn main() { let a = [1, @2@, 3]; }",
                    direction: "swap-previous",
                    expectedContent: "fn main() { let a = [2, 1, 3]; }",
                    expectedSelectionContent: "2",
                });
            });

            test("multiple node selection", async () => {
                await testMoveSelection({
                    language: "rust",
                    content: "fn main() { let a = [1, @2, 3@]; }",
                    direction: "swap-previous",
                    expectedContent: "fn main() { let a = [2, 3, 1]; }",
                    expectedSelectionContent: "2, 3",
                });
            });
        });

        suite("swap-next", function () {
            test("single node selection", async () => {
                await testMoveSelection({
                    language: "rust",
                    content: "fn main() { let a = [1, @2@, 3]; }",
                    direction: "swap-next",
                    expectedContent: "fn main() { let a = [1, 3, 2]; }",
                    expectedSelectionContent: "2",
                });
            });

            test("multiple node selection", async () => {
                await testMoveSelection({
                    language: "rust",
                    content: "fn main() { let a = [@1, 2@, 3]; }",
                    direction: "swap-next",
                    expectedContent: "fn main() { let a = [3, 1, 2]; }",
                    expectedSelectionContent: "1, 2",
                });
            });
        });

        suite("after-parent", function () {
            test("single node selection", async () => {
                await testMoveSelection({
                    language: "rust",
                    content: "fn main() { if true { @let a = [1, 2, 3];@ } }",
                    direction: "after-parent",
                    expectedContent: "fn main() { if true {  }let a = [1, 2, 3]; }",
                    expectedSelectionContent: "let a = [1, 2, 3];",
                });
            });

            test("multiple node selection", async () => {
                await testMoveSelection({
                    language: "rust",
                    content: "fn main() {\n    @let a = [1, 2, 3];\n    let b = 123;@  }",
                    direction: "after-parent",
                    expectedContent: "fn main() {\n      }let a = [1, 2, 3];\n    let b = 123;",
                    expectedSelectionContent: "let a = [1, 2, 3];\n    let b = 123;",
                });
            });
        });

        suite("before-parent", function () {
            test("single node selection", async () => {
                await testMoveSelection({
                    language: "rust",
                    content: "fn main() { { @let a = [1, 2, 3];@ } }",
                    direction: "before-parent",
                    expectedContent: "fn main() { let a = [1, 2, 3];{  } }",
                    expectedSelectionContent: "let a = [1, 2, 3];",
                });
            });

            test("multiple node selection", async () => {
                await testMoveSelection({
                    language: "rust",
                    content: "fn main() { { @let a = [1, 2, 3]; let b = 123;@ } }",
                    direction: "before-parent",
                    expectedContent: "fn main() { let a = [1, 2, 3]; let b = 123;{  } }",
                    expectedSelectionContent: "let a = [1, 2, 3]; let b = 123;",
                });
            });
        });
    });

    suite(".teleportSelection", function () {
        test("moves block across tree", async () => {
            await testTeleport({
                language: "rust",
                content: "fn main() { { @let a = [1, 2, 3];@ } } fn foo() { #{}# }",
                expectedContent: "fn main() { {  } } fn foo() { {}let a = [1, 2, 3]; }",
                expectedSelectionContent: "let a = [1, 2, 3];",
                expectedTargetContent: "{}",
            });

            await testTeleport({
                language: "rust",
                content: "fn foo() { #{}# } fn main() { { @let a = [1, 2, 3];@ } }",
                expectedContent: "fn foo() { {}let a = [1, 2, 3]; } fn main() { {  } }",
                expectedSelectionContent: "let a = [1, 2, 3];",
                expectedTargetContent: "{}",
            });
        });
    });
});

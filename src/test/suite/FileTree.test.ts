import * as Installer from "../../Installer";
import * as vscode from "vscode";
import { FileTree, MoveSelectionDirection } from "../../FileTree";
import { Language } from "web-tree-sitter";
import assert from "assert";
import { expect } from "chai";
import { parsersDir } from "./parsersDir";

suite("FileTree", function () {
    suite("Rust", function () {
        // @ts-expect-error initialized in beforeAll
        let language: Language = undefined;
        this.beforeAll(async () => {
            const lang = await Installer.loadParser(parsersDir, "tree-sitter-rust");
            assert.ok(
                lang,
                `failed to load ${Installer.getWasmBindingsPath(parsersDir, "tree-sitter-rust")}`
            );
            language = lang;
        });

        async function buildFileTree(content: string): Promise<FileTree> {
            const document = await vscode.workspace.openTextDocument({
                language: "rust",
                content,
            });
            const fileTree = await FileTree.new(language, document);
            return fileTree;
        }

        suite(".update", function () {
            test("updates tree after edit", async () => {
                const content = "fn main() {}";
                const fileTree = await buildFileTree(content);
                expect("\n" + fileTree.toString()).to.equal(`
source_file [0:0 - 0:12]
  function_item [0:0 - 0:12]
    identifier [0:3 - 0:7]
    parameters [0:7 - 0:9]
    block [0:10 - 0:12]`);

                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    fileTree.document.uri,
                    new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, content.length)),
                    "struct A;"
                );

                await vscode.workspace.applyEdit(edit);

                expect("\n" + fileTree.toString()).to.equal(`
source_file [0:0 - 0:9]
  struct_item [0:0 - 0:9]
    type_identifier [0:7 - 0:8]`);
            });
        });

        suite(".resolveVscodeSelection", () => {
            async function testResolveVscodeSelection(
                content: string,
                selectionRange: [number, number, number, number],
                expectedSelectionText: string | undefined
            ): Promise<void> {
                const fileTree = await buildFileTree(content);
                const selection = fileTree.resolveVscodeSelection(
                    new vscode.Selection(
                        new vscode.Position(selectionRange[0], selectionRange[1]),
                        new vscode.Position(selectionRange[2], selectionRange[3])
                    )
                );

                expect(selection?.getText(content)).to.equal(expectedSelectionText);
            }

            test("is node when selection is node range", async () => {
                await testResolveVscodeSelection(
                    "fn main() { let a = 1; let b = 2; }",
                    [0, 12, 0, 22],
                    "let a = 1;"
                );
            });

            test("expands to node when range within node range", async () => {
                await testResolveVscodeSelection(
                    "fn main() { let a = 1; let b = 2; }",
                    [0, 18, 0, 20],
                    "let a = 1;"
                );
            });

            test("is multiple nodes when range is multiple nodes range", async () => {
                await testResolveVscodeSelection(
                    "fn main() { let a = 1; let b = 2; }",
                    [0, 12, 0, 33],
                    "let a = 1; let b = 2;"
                );
            });

            test("is multiple nodes when range within multiple nodes ranges", async () => {
                await testResolveVscodeSelection(
                    "fn main() { let a = 1; let b = 2; }",
                    [0, 15, 0, 24],
                    "let a = 1; let b = 2;"
                );
            });

            test("expands scope when selection crosses node parent range", async () => {
                await testResolveVscodeSelection(
                    "fn main() { fn foo() { let a = 1; } let b = 2; }",
                    [0, 26, 0, 38],
                    "fn foo() { let a = 1; } let b = 2;"
                );
            });
        });

        suite(".moveSelection", function () {
            async function testMoveSelection(
                content: string,
                selectionRange: [number, number, number, number],
                direction: MoveSelectionDirection,
                expectedContent: string
            ): Promise<void> {
                const fileTree = await buildFileTree(content);
                const selection = fileTree.resolveVscodeSelection(
                    new vscode.Selection(
                        new vscode.Position(selectionRange[0], selectionRange[1]),
                        new vscode.Position(selectionRange[2], selectionRange[3])
                    )
                );
                assert.ok(selection);

                const result = await fileTree.moveSelection(selection, direction);

                expect(result.status).to.equal("ok");
                expect(fileTree.document.getText()).to.equal(expectedContent);
            }

            suite("swap-previous", function () {
                test("single node selection", async () => {
                    await testMoveSelection(
                        "fn main() { let a = [1, 2, 3]; }",
                        [0, 24, 0, 25],
                        "swap-previous",
                        "fn main() { let a = [2, 1, 3]; }"
                    );
                });

                test("multiple node selection", async () => {
                    await testMoveSelection(
                        "fn main() { let a = [1, 2, 3]; }",
                        [0, 24, 0, 28],
                        "swap-previous",
                        "fn main() { let a = [2, 3, 1]; }"
                    );
                });
            });
        });
    });

    suite("TSX", function () {
        // @ts-expect-error initialized in beforeAll
        let language: Language = undefined;
        this.beforeAll(async () => {
            const lang = await Installer.loadParser(parsersDir, "tree-sitter-typescript", "tree-sitter-tsx");
            assert.ok(
                lang,
                `failed to load ${Installer.getWasmBindingsPath(
                    parsersDir,
                    "tree-sitter-typescript",
                    "tree-sitter-tsx"
                )}`
            );
            language = lang;
        });

        async function buildFileTree(content: string): Promise<FileTree> {
            const document = await vscode.workspace.openTextDocument({
                language: "typescriptreact",
                content,
            });
            const fileTree = await FileTree.new(language, document);
            return fileTree;
        }

        suite(".update", function () {
            test("updates tree after edit", async () => {
                const content = "function main() {}";
                const fileTree = await buildFileTree(content);
                expect("\n" + fileTree.toString()).to.equal(`
program [0:0 - 0:18]
  function_declaration [0:0 - 0:18]
    identifier [0:9 - 0:13]
    formal_parameters [0:13 - 0:15]
    statement_block [0:16 - 0:18]`);

                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    fileTree.document.uri,
                    new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, content.length)),
                    "class A {}"
                );

                await vscode.workspace.applyEdit(edit);

                expect("\n" + fileTree.toString()).to.equal(`
program [0:0 - 0:10]
  class_declaration [0:0 - 0:10]
    type_identifier [0:6 - 0:7]
    class_body [0:8 - 0:10]`);
            });
        });

        suite(".resolveVscodeSelection", () => {
            async function testResolveVscodeSelection(
                content: string,
                selectionRange: [number, number, number, number],
                expectedSelectionText: string | undefined
            ): Promise<void> {
                const fileTree = await buildFileTree(content);
                const selection = fileTree.resolveVscodeSelection(
                    new vscode.Selection(
                        new vscode.Position(selectionRange[0], selectionRange[1]),
                        new vscode.Position(selectionRange[2], selectionRange[3])
                    )
                );

                expect(selection?.getText(content)).to.equal(expectedSelectionText);
            }

            test("is node when selection is node range", async () => {
                await testResolveVscodeSelection(
                    "function main() { return (<> <p>a</p> <p>b</p> </>); }",
                    [0, 32, 0, 33],
                    "a"
                );
            });

            test("expands to node when range within node range", async () => {
                await testResolveVscodeSelection(
                    "function main() { return (<> <p>a</p> <p>b</p> </>); }",
                    [0, 29, 0, 31],
                    "<p>"
                );
            });

            test("is multiple nodes when range is multiple nodes range", async () => {
                await testResolveVscodeSelection(
                    "function main() { return (<> <p>a</p> <p>b</p> </>); }",
                    [0, 29, 0, 37],
                    "<p>a</p>"
                );
            });

            test("is multiple nodes when range within multiple nodes ranges", async () => {
                await testResolveVscodeSelection(
                    "function main() { return (<> <p>a</p> <p>b</p> </>); }",
                    [0, 31, 0, 35],
                    "<p>a</p>"
                );
            });

            test("expands scope when selection crosses node parent range", async () => {
                await testResolveVscodeSelection(
                    "function main() { return (<> <p>a</p> <p>b</p> </>); }",
                    [0, 33, 0, 42],
                    "<p>a</p> <p>b</p>"
                );
            });
        });
    });
});

import * as Installer from "../../../Installer";
import * as vscode from "vscode";
import { FileTree } from "../../../FileTree";
import { Language } from "web-tree-sitter";
import assert from "assert";
import { expect } from "chai";

const parsersDir = "/Users/selfint/dev/github.com/selfint/code-blocks/parsers";

suite("FileTree", function () {
    // @ts-expect-error initialized in beforeAll
    let language: Language = undefined;
    this.beforeAll(async () => {
        const lang = await Installer.loadParser(parsersDir, "tree-sitter-rust");
        assert.ok(lang);
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

        test("is node when range within node range", async () => {
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
});

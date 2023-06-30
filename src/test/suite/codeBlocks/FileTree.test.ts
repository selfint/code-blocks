import * as Installer from "../../../Installer";
import * as vscode from "vscode";
import { FileTree } from "../../../FileTree";
import { Language } from "web-tree-sitter";
import assert from "assert";
import { expect } from "chai";

const parsersDir = "parsers";

suite("FileTree", function () {
    // @ts-expect-error initialized in beforeAll
    let language: Language = undefined;
    this.beforeAll(async () => {
        const lang = await Installer.loadParser(parsersDir, "tree-sitter-rust");
        assert.ok(lang);
        language = lang;
    });

    suite(".update", function () {
        test("updates tree after edit", async () => {
            const content = "fn main() {}";
            const document = await vscode.workspace.openTextDocument({
                language: "rust",
                content,
            });
            const fileTree = await FileTree.new(language, document);
            expect("\n" + fileTree.toString()).to.equal(`
source_file [0:0 - 0:12]
  function_item [0:0 - 0:12]
    identifier [0:3 - 0:7]
    parameters [0:7 - 0:9]
    block [0:10 - 0:12]`);

            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
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
});

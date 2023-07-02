import * as Installer from "../../Installer";
import * as assert from "assert";
import * as vscode from "vscode";
import { FileTree } from "../../FileTree";
import { Language } from "web-tree-sitter";
import { UpdateSelectionDirection } from "../../Selection";
import { expect } from "chai";

import { parsersDir } from "./parsersDir";

async function getCursorSelectionText(
    cursor: string,
    language: [string, Language],
    text: string,
    updates: UpdateSelectionDirection[] = []
): Promise<string | undefined> {
    const cursorIndex = text.indexOf(cursor);
    text = text.replace(cursor, "");

    const doc = await vscode.workspace.openTextDocument({
        language: language[0],
        content: text,
    });

    const fileTree = await FileTree.new(language[1], doc);
    const selection = fileTree.selectBlock(cursorIndex);

    if (selection === undefined) {
        return undefined;
    }

    for (const update of updates) {
        selection.update(update);
    }

    const selectionText = selection.getText(text);

    return selectionText;
}

/**
 * Build a function that starts selection next to the CURSOR string,
 * then runs the given updates and returns the selected text.
 */
type UpdateRunner = (text: string, updates?: UpdateSelectionDirection[]) => Promise<string | undefined>;
function buildUpdateRunner(cursor: string, language: [string, Language]): UpdateRunner {
    return async (text: string, updates: UpdateSelectionDirection[] = []): Promise<string | undefined> =>
        await getCursorSelectionText(cursor, language, text, updates);
}

suite("Selection", function () {
    suite(".update", function () {
        suite("Rust", function () {
            const cursor = "@";

            // @ts-expect-error initialized in beforeAll
            let selectionAt: UpdateRunner = undefined;
            this.beforeAll(async () => {
                const rust = await Installer.loadParser(parsersDir, "tree-sitter-rust");
                assert.ok(rust);
                selectionAt = buildUpdateRunner(cursor, ["rust", rust]);
            });

            test("Select source_file node is undefined", async () => {
                expect(await selectionAt("fn main() { }@")).to.be.undefined;
            });

            test("Update selection parent/child", async () => {
                expect(await selectionAt("fn main() { @ }")).to.equal("{  }");
                expect(await selectionAt("fn main() { @ }", ["parent"])).to.equal("fn main() {  }");
                expect(await selectionAt("fn main() { @ }", ["parent", "child"])).to.equal("{  }");
                expect(
                    await selectionAt("fn main() { pub fn foo() { @ } }", ["parent", "parent", "parent"])
                ).to.equal("fn main() { pub fn foo() {  } }");
            });

            test("Update selection previous/next", async () => {
                const text = "[1, @2, 3]";

                expect(await selectionAt(text)).to.equal("2");
                expect(await selectionAt(text, ["add-previous"])).to.equal("1, 2");
                expect(await selectionAt(text, ["add-next"])).to.equal("2, 3");
                expect(await selectionAt(text, ["add-previous", "remove-next"])).to.equal("1");
                expect(await selectionAt(text, ["add-previous", "remove-previous"])).to.equal("2");
                expect(await selectionAt(text, ["add-next", "remove-next"])).to.equal("2");
                expect(await selectionAt(text, ["add-next", "remove-previous"])).to.equal("3");
            });
        });

        suite("TSX", function () {
            const cursor = "@";
            // @ts-expect-error initialized in beforeAll
            let selectionAt: UpdateRunner = undefined;
            this.beforeAll(async () => {
                const tsx = await Installer.loadParser(
                    parsersDir,
                    "tree-sitter-typescript",
                    "tree-sitter-tsx"
                );
                assert.ok(tsx);
                selectionAt = buildUpdateRunner(cursor, ["typescriptreact", tsx]);
            });

            test("Select source_file node is undefined", async () => {
                expect(await selectionAt("function main() { }@")).to.be.undefined;
            });

            test("Update selection parent/child", async () => {
                const text = "function main() { @ }";
                expect(await selectionAt(text)).to.equal("{  }");
                expect(await selectionAt(text, ["parent"])).to.equal("function main() {  }");
                expect(await selectionAt(text, ["parent", "child"])).to.equal("{  }");
            });

            test("Update selection previous/next", async () => {
                const text = "(<ul><li>1</li><li>@2</li><li>3</li></ul>)";

                expect(await selectionAt(text)).to.equal("2");
                expect(await selectionAt(text, ["parent", "add-previous"])).to.equal("<li>1</li><li>2</li>");
                expect(await selectionAt(text, ["parent", "add-next"])).to.equal("<li>2</li><li>3</li>");
                expect(await selectionAt(text, ["parent", "add-previous", "remove-next"])).to.equal(
                    "<li>1</li>"
                );
                expect(await selectionAt(text, ["parent", "add-previous", "remove-previous"])).to.equal(
                    "<li>2</li>"
                );
                expect(await selectionAt(text, ["parent", "add-next", "remove-next"])).to.equal("<li>2</li>");
                expect(await selectionAt(text, ["parent", "add-next", "remove-previous"])).to.equal(
                    "<li>3</li>"
                );
            });
        });
    });
});

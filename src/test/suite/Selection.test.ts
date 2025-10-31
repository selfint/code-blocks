import { UpdateSelectionDirection } from "../../Selection";
import { expect } from "chai";
import { openDocument } from "./testUtils";

suite("Selection", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "2s");
    const cursor = "@";

    async function selectionAt(
        language: string,
        content: string,
        updates: UpdateSelectionDirection[] = []
    ): Promise<string | undefined> {
        const cursorIndex = content.indexOf(cursor);
        content = content.replace(cursor, "");

        const { fileTree } = await openDocument(content, language);
        const selection = fileTree.selectBlock(cursorIndex);

        if (selection === undefined) {
            return undefined;
        }

        for (const update of updates) {
            selection.update(update, fileTree.blocks);
        }

        const selectionText = selection.getText(content);

        return selectionText;
    }

    suite(".getPrevious", function () {
        test("Ignores previous nodes that start with parent", async () => {
            const text = "<parent><child>@1</child><child>2</child></parent>";

            expect(await selectionAt("html", text)).to.equal("1");
            expect(await selectionAt("html", text, ["parent"])).to.equal("<child>1</child>");
            expect(await selectionAt("html", text, ["parent", "add-previous"])).to.equal("<child>1</child>");
        });
    });

    suite(".getNext", function () {
        test("Ignores next nodes that start with parent", async () => {
            const text = "<parent><child>1</child><child>@2</child></parent>";

            expect(await selectionAt("html", text)).to.equal("2");
            expect(await selectionAt("html", text, ["parent"])).to.equal("<child>2</child>");
            expect(await selectionAt("html", text, ["parent", "add-next"])).to.equal("<child>2</child>");
        });
    });

    suite(".update", function () {
        test("Select source_file node is undefined", async () => {
            expect(await selectionAt("rust", "fn main() { }@")).to.be.undefined;
        });

        test.only("Update selection parent/child", async () => {
            expect(await selectionAt("rust", "fn foo() { fn nested() { @ } }")).to.equal("fn nested() {  }");
            expect(await selectionAt("rust", "fn main() { @ }")).to.equal("fn main() {  }");
            expect(await selectionAt("rust", "if true { @ }", ["parent"])).to.equal("if true {  }");
            expect(await selectionAt("rust", "if true { @ }", ["parent", "child"])).to.equal("true");
            expect(
                await selectionAt("rust", "fn main() { pub fn foo() { @ } }", ["parent", "parent", "parent"])
            ).to.equal("fn main() { pub fn foo() {  } }");
        });

        test("Update selection previous/next", async () => {
            const text = "[1, @2, 3]";

            expect(await selectionAt("rust", text)).to.equal("2");
            expect(await selectionAt("rust", text, ["add-previous"])).to.equal("1, 2");
            expect(await selectionAt("rust", text, ["add-next"])).to.equal("2, 3");
            expect(await selectionAt("rust", text, ["add-previous", "remove-next"])).to.equal("1");
            expect(await selectionAt("rust", text, ["add-previous", "remove-previous"])).to.equal("2");
            expect(await selectionAt("rust", text, ["add-next", "remove-next"])).to.equal("2");
            expect(await selectionAt("rust", text, ["add-next", "remove-previous"])).to.equal("3");
        });

        test("Select source_file node is undefined", async () => {
            expect(await selectionAt("typescriptreact", "function main() { }@")).to.be.undefined;
        });

        test("Update selection parent/child", async () => {
            const text = "function main() { @ }";
            expect(await selectionAt("typescriptreact", text)).to.equal("function main() {  }");
        });

        test("Update selection previous/next", async () => {
            const text = "(<ul><li>1</li><li>@2</li><li>3</li></ul>)";

            expect(await selectionAt("typescriptreact", text)).to.equal("2");
            expect(await selectionAt("typescriptreact", text, ["parent", "add-previous"])).to.equal(
                "<li>1</li><li>2</li>"
            );
            expect(await selectionAt("typescriptreact", text, ["parent", "add-next"])).to.equal(
                "<li>2</li><li>3</li>"
            );
            expect(
                await selectionAt("typescriptreact", text, ["parent", "add-previous", "remove-next"])
            ).to.equal("<li>1</li>");
            expect(
                await selectionAt("typescriptreact", text, ["parent", "add-previous", "remove-previous"])
            ).to.equal("<li>2</li>");
            expect(
                await selectionAt("typescriptreact", text, ["parent", "add-next", "remove-next"])
            ).to.equal("<li>2</li>");
            expect(
                await selectionAt("typescriptreact", text, ["parent", "add-next", "remove-previous"])
            ).to.equal("<li>3</li>");
        });
    });
});

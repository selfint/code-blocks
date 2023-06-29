import * as Installer from "../../../Installer";
import * as assert from "assert";
import * as codeBlocks from "../../../codeBlocks";
import * as vscode from "vscode";
import { FileTree } from "../../../FileTree";
import { blockTreeToBlockLocationTree } from "../../../editor/CodeBlocksEditor";
import { expect } from "chai";

function box(text: string, indent: number): string {
    const lines = text.split(/\n/);
    let newText = "";
    let longestLength = lines[0].length;
    for (const line of lines) {
        newText += " ".repeat(indent) + "| " + line + " |" + "\n";
        longestLength = Math.max(longestLength, line.length);
    }

    const border = " ".repeat(indent) + "+" + "-".repeat(longestLength + 2) + "+\n";
    return border + newText + border;
}

function blockTreesToString(source: string, blockTrees: codeBlocks.BlockTree[], indent = 0): string {
    let text = "";
    for (let i = 0; i < blockTrees.length; i++) {
        const blockTree = blockTrees[i];

        const block = blockTree.block;
        const children = blockTree.children;
        if (children.length === 0) {
            text += box(source.substring(block[0].startIndex, block[block.length - 1].endIndex), indent);
        } else {
            text += box(source.substring(block[0].startIndex, children[0].block[0].startIndex), indent);
            text += blockTreesToString(source, children, indent + 1);
            const lastChild = children[children.length - 1];
            text += box(
                source.substring(
                    lastChild.block[lastChild.block.length - 1].endIndex,
                    block[block.length - 1].endIndex
                ),
                indent
            );
        }

        if (i !== blockTrees.length - 1) {
            const nextBlock = blockTrees[i + 1];
            text += box(
                source.substring(
                    blockTree.block[blockTree.block.length - 1].endIndex,
                    nextBlock.block[0].startIndex
                ),
                indent
            );
        }
    }

    return text;
}

suite("blockTrees", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "2s");

    suite("getBlockTrees", function () {
        this.beforeAll(() => {
            return void vscode.window.showInformationMessage("Start blockTrees.getBlockTrees tests");
        });

        test("resolves sequential blocks", async function () {
            const rust = await Installer.loadParser("parsers", "tree-sitter-rust");
            assert.ok(rust);

            const text = "fn foo() {}\nfn bar() {}";
            const fileTree = await FileTree.new(rust, text);
            const queries = [rust.query("(function_item) @item")];
            const blocksTrees = codeBlocks.getBlockTrees(fileTree.tree, queries);

            expect(JSON.stringify(blocksTrees.map(blockTreeToBlockLocationTree))).to.equal(
                `[{"block":{"startByte":0,"endByte":11,"startRow":0,"startCol":0,"endRow":0,"endCol":11},"children":[]},{"block":{"startByte":12,"endByte":23,"startRow":1,"startCol":0,"endRow":1,"endCol":11},"children":[]}]`
            );
            expect("\n" + blockTreesToString(text, blocksTrees)).to.equal(`
+-------------+
| fn foo() {} |
+-------------+
+--+
|  |
|  |
+--+
+-------------+
| fn bar() {} |
+-------------+
`);
        });

        test("resolves nested blocks", async function () {
            const rust = await Installer.loadParser("parsers", "tree-sitter-rust");
            assert.ok(rust);

            const text = `
fn grandparent() {
    fn father() {
        fn boy() {}
    }
    fn mother() {
        fn girl() {}
    }
}
`;
            const fileTree = await FileTree.new(rust, text);
            const queries = [rust.query("(function_item) @item")];
            const blocksTrees = codeBlocks.getBlockTrees(fileTree.tree, queries);

            expect(JSON.stringify(blocksTrees.map(blockTreeToBlockLocationTree))).to.equal(
                `[{"block":{"startByte":1,"endByte":110,"startRow":1,"startCol":0,"endRow":8,"endCol":1},"children":[{"block":{"startByte":24,"endByte":63,"startRow":2,"startCol":4,"endRow":4,"endCol":5},"children":[{"block":{"startByte":46,"endByte":57,"startRow":3,"startCol":8,"endRow":3,"endCol":19},"children":[]}]},{"block":{"startByte":68,"endByte":108,"startRow":5,"startCol":4,"endRow":7,"endCol":5},"children":[{"block":{"startByte":90,"endByte":102,"startRow":6,"startCol":8,"endRow":6,"endCol":20},"children":[]}]}]}]`
            );
            expect("\n" + blockTreesToString(text, blocksTrees)).to.equal(`
+--------------------+
| fn grandparent() { |
|      |
+--------------------+
 +---------------+
 | fn father() { |
 |          |
 +---------------+
  +-------------+
  | fn boy() {} |
  +-------------+
 +-------+
 |  |
 |     } |
 +-------+
 +------+
 |  |
 |      |
 +------+
 +---------------+
 | fn mother() { |
 |          |
 +---------------+
  +--------------+
  | fn girl() {} |
  +--------------+
 +-------+
 |  |
 |     } |
 +-------+
+---+
|  |
| } |
+---+
`);
        });
    });
});

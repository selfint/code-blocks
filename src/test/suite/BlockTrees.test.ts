import * as vscode from "vscode";

import { expect } from "chai";
import { Query } from "tree-sitter";

import { BlockTree, getBlockTrees } from "../../BlockTree";
import { Language } from "../../Installer";
import { openDocument } from "./testUtils";

function box(text: string, indent: number): string {
    const lines = text.split(/\n/);
    let newLines = "";
    const longestLength = Math.max(...lines.map((l) => l.length));
    for (const line of lines) {
        newLines += " ".repeat(indent) + "| " + line + " ".repeat(longestLength - line.length) + " |" + "\n";
    }

    const border = " ".repeat(indent) + "+" + "-".repeat(longestLength + 2) + "+\n";
    return border + newLines + border;
}

function blockTreesToString(source: string, blockTrees: BlockTree[], indent = 0): string {
    let treesText = "";
    for (let i = 0; i < blockTrees.length; i++) {
        let treeText = "";
        const blockTree = blockTrees[i];

        const block = blockTree.block;
        const children = blockTree.children;
        if (children.length === 0) {
            treeText += source.substring(block[0].startIndex, block[block.length - 1].endIndex);
        } else {
            treeText += source.substring(block[0].startIndex, children[0].block[0].startIndex);
            treeText += "\n" + blockTreesToString(source, children, indent + 1);
            const lastChild = children[children.length - 1];
            treeText += source.substring(
                lastChild.block[lastChild.block.length - 1].endIndex,
                block[block.length - 1].endIndex
            );
        }

        if (i !== blockTrees.length - 1) {
            const nextBlock = blockTrees[i + 1];
            treeText += source.substring(
                blockTree.block[blockTree.block.length - 1].endIndex,
                nextBlock.block[0].startIndex
            );
        }

        treesText += box(treeText, indent);
    }

    return treesText;
}

suite("BlockTrees", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "2s");

    suite("getBlockTrees", function () {
        this.beforeAll(() => {
            return void vscode.window.showInformationMessage("Start blockTrees.getBlockTrees tests");
        });

        test("resolves sequential blocks", async function () {
            const text = "fn foo() {}\nfn bar() {}";
            const { fileTree } = await openDocument(text, "rust");
            const lang = fileTree.parser.getLanguage() as Language;
            const queries = [new Query(lang, "(function_item) @item")];
            const blocksTrees = getBlockTrees(fileTree.tree, queries);

            expect("\n" + blockTreesToString(text, blocksTrees)).to.equal(`
+-------------+
| fn foo() {} |
|             |
+-------------+
+-------------+
| fn bar() {} |
+-------------+
`);
        });

        test("resolves nested blocks", async function () {
            const text = `
fn grandpa() {
    fn father() {
        fn boy() {}
    }
    fn mother() {
        fn girl() {}
    }
}
fn grandma() {
    fn father() {
        fn boy() {}
    }
    fn mother() {
        fn girl() {}
    }
}
`;
            const { fileTree } = await openDocument(text, "rust");
            const lang = fileTree.parser.getLanguage() as Language;
            const queries = [new Query(lang, "(function_item) @item")];
            const blocksTrees = getBlockTrees(fileTree.tree, queries);

            expect("\n" + blockTreesToString(text, blocksTrees)).to.equal(`
+-------------------------+
| fn grandpa() {          |
|                         |
|  +-------------------+  |
|  | fn father() {     |  |
|  |                   |  |
|  |   +-------------+ |  |
|  |   | fn boy() {} | |  |
|  |   +-------------+ |  |
|  |                   |  |
|  |     }             |  |
|  |                   |  |
|  +-------------------+  |
|  +--------------------+ |
|  | fn mother() {      | |
|  |                    | |
|  |   +--------------+ | |
|  |   | fn girl() {} | | |
|  |   +--------------+ | |
|  |                    | |
|  |     }              | |
|  +--------------------+ |
|                         |
| }                       |
|                         |
+-------------------------+
+-------------------------+
| fn grandma() {          |
|                         |
|  +-------------------+  |
|  | fn father() {     |  |
|  |                   |  |
|  |   +-------------+ |  |
|  |   | fn boy() {} | |  |
|  |   +-------------+ |  |
|  |                   |  |
|  |     }             |  |
|  |                   |  |
|  +-------------------+  |
|  +--------------------+ |
|  | fn mother() {      | |
|  |                    | |
|  |   +--------------+ | |
|  |   | fn girl() {} | | |
|  |   +--------------+ | |
|  |                    | |
|  |     }              | |
|  +--------------------+ |
|                         |
| }                       |
+-------------------------+
`);
        });
    });
});

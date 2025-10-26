import { expect } from "chai";
import * as vscode from "vscode";
import { openDocument } from "./testUtils";

suite("Multi-select block mode", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "2s");

    test("selectBlock supports multi-cursor", async function () {
        const content = `function a(){}\nfunction b(){}\nfunction c(){}`;
        const { activeEditor } = await openDocument(content, "typescript");

        const idxA = content.indexOf("a()");
        const idxC = content.indexOf("c()");
        const posA = activeEditor.document.positionAt(idxA);
        const posC = activeEditor.document.positionAt(idxC);
        activeEditor.selections = [new vscode.Selection(posA, posA), new vscode.Selection(posC, posC)];

        await vscode.commands.executeCommand("codeBlocks.selectBlock");
        const sels = activeEditor.selections;
        expect(sels.length).to.equal(2);
        const texts = sels.map(s => activeEditor.document.getText(s).trim());
        // selectBlock on an identifier selects the node under cursor (identifier), not entire function
        expect(texts).to.deep.equal(["a", "c"]);
    });

    test("selectNext updates each selection independently", async function () {
        const content = `function a(){}\nfunction b(){}\nfunction c(){}`;
        const { activeEditor } = await openDocument(content, "typescript");

        const idxA = content.indexOf("a()");
        const idxC = content.indexOf("c()");
        const posA = activeEditor.document.positionAt(idxA);
        const posC = activeEditor.document.positionAt(idxC);
        activeEditor.selections = [new vscode.Selection(posA, posA), new vscode.Selection(posC, posC)];

        await vscode.commands.executeCommand("codeBlocks.selectBlock");
        await vscode.commands.executeCommand("codeBlocks.selectNext");

        const sels = activeEditor.selections;
        expect(sels.length).to.equal(2);
        const texts = sels.map(s => activeEditor.document.getText(s).trim());
        // identifier + next sibling (parameters) yields 'a()' and 'c()'
        expect(texts).to.deep.equal(["a()", "c()"]);
    });

    test("navigateDown moves cursors to next siblings with multi-cursor", async function () {
        const content = `let a, b, c;`;
        const { activeEditor } = await openDocument(content, "typescript");

        const posA = activeEditor.document.positionAt(content.indexOf("a"));
        const posB = activeEditor.document.positionAt(content.indexOf("b"));
        activeEditor.selections = [new vscode.Selection(posA, posA), new vscode.Selection(posB, posB)];

        await vscode.commands.executeCommand("codeBlocks.selectBlock");
        await vscode.commands.executeCommand("codeBlocks.navigateDown"); // 'right' -> next sibling

        const sels = activeEditor.selections;
        expect(sels.length).to.equal(2);
        const starts = sels.map(s => activeEditor.document.offsetAt(s.start));
        const expected = [content.indexOf("b"), content.indexOf("c")];
        expect(starts).to.deep.equal(expected);
    });

    test("moveDown swaps each selected element with its next sibling in arrays (multi)", async function () {
        const src = `fn main() { let a = [1, 2, 3]; }`;
        const { activeEditor } = await openDocument(src, "rust");

        const pos1 = activeEditor.document.positionAt(src.indexOf("1"));
        const pos3 = activeEditor.document.positionAt(src.indexOf("3"));
        activeEditor.selections = [new vscode.Selection(pos1, pos1), new vscode.Selection(pos3, pos3)];

        await vscode.commands.executeCommand("codeBlocks.selectBlock");
        await vscode.commands.executeCommand("codeBlocks.moveDown");

        const text = activeEditor.document.getText();
        expect(text).to.equal(`fn main() { let a = [2, 1, 3]; }`);
        expect(activeEditor.selections.length).to.equal(2);
    });
});

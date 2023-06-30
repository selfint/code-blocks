import * as vscode from "vscode";
import Parser, { Language, Tree } from "web-tree-sitter";

import { Selection } from "./codeBlocks/Selection";
import { parserFinishedInit } from "./extension";

function positionToPoint(pos: vscode.Position): Parser.Point {
    return {
        row: pos.line,
        column: pos.character,
    };
}

export class FileTree {
    public parser: Parser;
    public tree: Tree;
    public document: vscode.TextDocument;
    public version: number;
    public selection: Selection | undefined;

    private constructor(parser: Parser, document: vscode.TextDocument) {
        this.parser = parser;
        this.tree = parser.parse(document.getText());
        this.document = document;
        this.version = document.version;

        this.selection = undefined;
    }

    public static async new(language: Language, document: vscode.TextDocument): Promise<FileTree> {
        await parserFinishedInit;
        const parser = new Parser();
        parser.setLanguage(language);

        return new FileTree(parser, document);
    }

    public update(event: vscode.TextDocumentChangeEvent): void {
        for (const change of event.contentChanges) {
            const startIndex = change.rangeOffset;
            const oldEndIndex = change.rangeOffset + change.rangeLength;
            const newEndIndex = change.rangeOffset + change.text.length;

            const startPosition = change.range.start;
            const oldEndPosition = change.range.end;
            const newEndPosition = event.document.positionAt(newEndIndex);

            this.tree.edit({
                startIndex: startIndex,
                oldEndIndex: oldEndIndex,
                newEndIndex: newEndIndex,
                startPosition: positionToPoint(startPosition),
                oldEndPosition: positionToPoint(oldEndPosition),
                newEndPosition: positionToPoint(newEndPosition),
            } as Parser.Edit);
        }

        this.tree = this.parser.parse(event.document.getText(), this.tree);
    }

    public startSelection(cursorIndex: number): Selection | undefined {
        const nodeAtCursor = this.tree.rootNode.namedDescendantForIndex(cursorIndex);
        // ignore root nodes, probably only includes 'file' - like nodes
        // TODO: test more parsers to ensure this is always the correct action
        if (nodeAtCursor.parent === null) {
            return undefined;
        }

        this.selection = new Selection(nodeAtCursor, this.version);
        return this.selection;
    }
}

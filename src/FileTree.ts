import * as Parser from "web-tree-sitter";
import * as vscode from "vscode";
import { Language, Tree } from "web-tree-sitter";

function positionToPoint(pos: vscode.Position): Parser.Point {
    return {
        row: pos.line,
        column: pos.character,
    };
}

export class FileTree {
    public parser: Parser;
    public tree: Tree;

    private constructor(parser: Parser, text: string) {
        this.parser = parser;
        this.tree = parser.parse(text);
    }

    public static async new(language: Language, text: string): Promise<FileTree> {
        await Parser.init();
        const parser = new Parser();
        parser.setLanguage(language);

        return new FileTree(parser, text);
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
}

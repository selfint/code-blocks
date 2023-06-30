import * as vscode from "vscode";
import Parser, { Language, SyntaxNode, Tree } from "web-tree-sitter";

import { Selection } from "./codeBlocks/Selection";
import { parserFinishedInit } from "./extension";

function positionToPoint(pos: vscode.Position): Parser.Point {
    return {
        row: pos.line,
        column: pos.character,
    };
}

export class FileTree implements vscode.Disposable {
    public parser: Parser;
    public tree: Tree;
    public document: vscode.TextDocument;
    public version: number;

    private onUpdateEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter();
    public onUpdate = this.onUpdateEmitter.event;

    private disposables: vscode.Disposable[];

    private constructor(parser: Parser, document: vscode.TextDocument) {
        this.parser = parser;
        this.tree = parser.parse(document.getText());
        this.document = document;
        this.version = document.version;

        this.disposables = [this.onUpdateEmitter];
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (event.document.uri.toString() === this.document.uri.toString()) {
                    this.update(event);
                }
            })
        );
    }

    async dispose(): Promise<void> {
        await Promise.all(
            this.disposables.map(async (d) => {
                await d.dispose();
            })
        );
    }

    public static async new(language: Language, document: vscode.TextDocument): Promise<FileTree> {
        await parserFinishedInit;
        const parser = new Parser();
        parser.setLanguage(language);

        return new FileTree(parser, document);
    }

    private update(event: vscode.TextDocumentChangeEvent): void {
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
        this.onUpdateEmitter.fire();
    }

    public startSelection(cursorIndex: number): Selection | undefined {
        const nodeAtCursor = this.tree.rootNode.namedDescendantForIndex(cursorIndex);
        // ignore root nodes, probably only includes 'file' - like nodes
        // TODO: test more parsers to ensure this is always the correct action
        if (nodeAtCursor.parent === null) {
            return undefined;
        }

        return Selection.fromNode(nodeAtCursor, this.version);
    }

    public resolveVscodeSelection(vscodeSelection: vscode.Selection): Selection | undefined {
        const root = this.tree.rootNode;
        const startNode = root.namedDescendantForPosition(positionToPoint(vscodeSelection.start));
        const endPosition = positionToPoint(vscodeSelection.end);
        // we want an inclusive range, but vscode.Selection has an exclusive end value
        endPosition.column -= 1;
        const endNode = root.namedDescendantForPosition(endPosition);

        if (startNode.equals(endNode)) {
            return Selection.fromNode(startNode, this.version);
        }

        // ignore entire file selections
        if (startNode.parent === null || endNode.parent === null) {
            return undefined;
        }

        // get all parents of start and end node
        const startParents: SyntaxNode[] = [startNode.parent];
        const endParents: SyntaxNode[] = [endNode.parent];
        while (startParents.at(-1)?.parent || endParents.at(-1)?.parent) {
            const nextStartParent = startParents.at(-1)?.parent;
            if (nextStartParent) {
                startParents.push(nextStartParent);
            }
            const nextEndParent = endParents.at(-1)?.parent;
            if (nextEndParent) {
                endParents.push(nextEndParent);
            }
        }

        // find lowest common parent of start and end nodes
        const lowestCommonParent = ((): SyntaxNode | undefined => {
            const startParentInEndParents = startParents.findIndex(
                (startParent) => endParents.findIndex((endParent) => endParent.equals(startParent)) !== -1
            );
            const endParentInStartParents = endParents.findIndex(
                (endParent) => startParents.findIndex((startParent) => startParent.equals(endParent)) !== -1
            );

            if (0 <= startParentInEndParents && startParentInEndParents <= endParentInStartParents) {
                return startParents.at(startParentInEndParents);
            } else if (0 <= endParentInStartParents) {
                return endParents.at(endParentInStartParents);
            } else {
                return undefined;
            }
        })();

        if (lowestCommonParent === undefined) {
            // should be impossible
            throw new Error("got start and end nodes without a common parent");
        }

        // get all named children in the common parent from start to end nodes
        const selectedNodes = [];
        for (const child of lowestCommonParent.namedChildren) {
            if (child.endIndex > startNode.startIndex && child.startIndex <= endNode.endIndex) {
                selectedNodes.push(child);
            }
        }

        // aren't the nodes already sorted?
        // TODO: check if we can remove this
        selectedNodes.sort((a, b) => a.startIndex - b.startIndex);

        return new Selection([startNode], selectedNodes, this.version);
    }

    public toString(): string {
        function nodeToString(node: SyntaxNode, indent = 0): string {
            function nodeRangeToString(node: SyntaxNode): string {
                const start = node.startPosition;
                const end = node.endPosition;

                return `${start.row}:${start.column} - ${end.row}:${end.column}`;
            }

            const nodeString = `${" ".repeat(indent)}${node.type} [${nodeRangeToString(node)}]`;
            if (node.namedChildCount === 0) {
                return nodeString;
            } else {
                const childrenString = node.namedChildren.map((n) => nodeToString(n, indent + 2)).join("\n");
                return nodeString + "\n" + childrenString;
            }
        }

        return nodeToString(this.tree.rootNode);
    }
}

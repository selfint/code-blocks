import * as vscode from "vscode";
import { BlockTree, getBlockTrees } from "./BlockTree";
import Parser, { Language, Query, SyntaxNode, Tree } from "web-tree-sitter";
import { Result, err, ok } from "./result";
import { Selection } from "./Selection";
import { getLanguageConfig } from "./configuration";
import { parserFinishedInit } from "./extension";

function positionToPoint(pos: vscode.Position): Parser.Point {
    return {
        row: pos.line,
        column: pos.character,
    };
}

export function pointToPosition(point: Parser.Point): vscode.Position {
    return new vscode.Position(point.row, point.column);
}

function parserRangeToVscodeRange(range: Parser.Range): vscode.Range {
    return new vscode.Range(pointToPosition(range.startPosition), pointToPosition(range.endPosition));
}

export type MoveSelectionDirection = "swap-previous" | "swap-next";
export class FileTree implements vscode.Disposable {
    public parser: Parser;
    public tree: Tree;
    public blocks: BlockTree[] | undefined;
    public document: vscode.TextDocument;
    public version: number;

    private queries: Query[] | undefined;
    private lazyLoadQueries: () => Query[] | undefined;
    private blockMode = false;

    private onUpdateEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter();
    public onUpdate = this.onUpdateEmitter.event;

    private disposables: vscode.Disposable[];

    private constructor(parser: Parser, document: vscode.TextDocument) {
        this.parser = parser;
        this.tree = parser.parse(document.getText());
        this.document = document;
        this.version = document.version;

        const queryStrings = getLanguageConfig(document.languageId).queries;
        if (queryStrings !== undefined) {
            const language = parser.getLanguage();
            this.lazyLoadQueries = (): Query[] => {
                if (this.queries === undefined) {
                    this.queries = queryStrings.map((q) => language.query(q));
                }

                return this.queries;
            };
        } else {
            this.lazyLoadQueries = (): undefined => undefined;
        }

        if (this.blockMode) {
            const queries = this.lazyLoadQueries();
            if (queries !== undefined) {
                this.blocks = getBlockTrees(this.tree, queries);
            }
        }

        this.disposables = [this.onUpdateEmitter];
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (event.document.uri.toString() === this.document.uri.toString()) {
                    this.update(event);
                }
            })
        );
    }

    public toggleBlockMode(newBlockMode: boolean): void {
        this.blockMode = newBlockMode;
        if (!this.blockMode) {
            this.blocks = undefined;
        } else {
            const queries = this.lazyLoadQueries();
            if (queries !== undefined) {
                this.blocks = getBlockTrees(this.tree, queries);
            }
        }
    }

    async dispose(): Promise<void> {
        this.tree.delete();
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
        if (this.blockMode) {
            const queries = this.lazyLoadQueries();
            if (queries !== undefined) {
                this.blocks = getBlockTrees(this.tree, queries);
            }
        }
        this.version = event.document.version;
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

        // get all parents of start and end nodes
        const parents = (node: SyntaxNode): SyntaxNode[] => {
            const parentNodes = [];
            while (node.parent) {
                parentNodes.push(node.parent);
                node = node.parent;
            }

            return parentNodes;
        };
        const startParents = parents(startNode);
        const endParents = parents(endNode);

        // find lowest common parent of start and end nodes
        const startParentInEndParents = startParents.findIndex((startParent) =>
            endParents.some((endParent) => endParent.equals(startParent))
        );
        const endParentInStartParents = endParents.findIndex((endParent) =>
            startParents.some((startParent) => startParent.equals(endParent))
        );

        let lowestCommonParent = undefined;
        if (0 <= startParentInEndParents && startParentInEndParents <= endParentInStartParents) {
            lowestCommonParent = startParents[startParentInEndParents];
        } else if (0 <= endParentInStartParents) {
            lowestCommonParent = endParents[endParentInStartParents];
        } else {
            // should be impossible
            throw new Error("got start and end nodes without a common parent");
        }

        // get all named children in the common parent from start to end nodes
        const selectedNodes = lowestCommonParent.namedChildren.filter(
            (child) => child.endIndex > startNode.startIndex && child.startIndex <= endNode.endIndex
        );

        // TODO: aren't the nodes already sorted? check if we can remove this
        selectedNodes.sort((a, b) => a.startIndex - b.startIndex);

        return new Selection([startNode], selectedNodes, this.version);
    }

    private moveSelectionLock = false;
    public async moveSelection(
        selection: Selection,
        direction: MoveSelectionDirection
    ): Promise<Result<vscode.Selection, string>> {
        if (this.moveSelectionLock) {
            return err("Can't move because another move is currently happening");
        }
        this.moveSelectionLock = true;

        try {
            if (selection.version !== this.version) {
                return err(
                    `Got invalid selection version ${selection.version}, fileTree version is ${this.version}`
                );
            }

            if (this.version !== this.document.version) {
                return err(
                    `Can't move because fileTree version ${this.version}, isn't document version ${this.document.version}`
                );
            }

            const edit = new vscode.WorkspaceEdit();
            const selectionText = selection.getText(this.document.getText());
            let newSelection: vscode.Selection;

            switch (direction) {
                case "swap-previous": {
                    // TODO: if block mode, resolve previous block
                    const previousNode = selection.selectedSiblings[0].previousNamedSibling;
                    if (!previousNode) {
                        return err(`Can't move to ${direction}, previous node of selection is null`);
                    }

                    const selectionRange = selection.getRange();

                    // swap previous node text and selection text
                    edit.replace(
                        this.document.uri,
                        parserRangeToVscodeRange(selectionRange),
                        previousNode.text
                    );
                    edit.replace(
                        this.document.uri,
                        new vscode.Range(
                            pointToPosition(previousNode.startPosition),
                            pointToPosition(previousNode.endPosition)
                        ),
                        selectionText
                    );

                    // cache previous node start index before edit
                    // since the tree will catch the edit, and the next node's
                    // start/end indices will change
                    const previousNodeStartIndex = previousNode.startIndex;
                    await vscode.workspace.applyEdit(edit);
                    newSelection = new vscode.Selection(
                        this.document.positionAt(previousNodeStartIndex),
                        this.document.positionAt(
                            previousNodeStartIndex + selectionRange.endIndex - selectionRange.startIndex
                        )
                    );
                    break;
                }
                case "swap-next": {
                    // TODO: if block mode, resolve previous block
                    const nextNode = selection.selectedSiblings.at(-1)?.nextNamedSibling;
                    if (!nextNode) {
                        return err(`Can't move to ${direction}, next node of selection is null`);
                    }

                    // swap next node text and selection text
                    const selectionRange = selection.getRange();
                    edit.replace(
                        this.document.uri,
                        new vscode.Range(
                            pointToPosition(nextNode.startPosition),
                            pointToPosition(nextNode.endPosition)
                        ),
                        selectionText
                    );
                    edit.replace(this.document.uri, parserRangeToVscodeRange(selectionRange), nextNode.text);

                    // calculate forward index shift before applying edit
                    // since the tree will catch the edit, and the next node's
                    // start/end indices will change
                    const forwardShift = nextNode.endIndex - selectionRange.endIndex;
                    await vscode.workspace.applyEdit(edit);

                    // end index is exclusive, so selection *really* ends at endIndex - 1
                    newSelection = new vscode.Selection(
                        this.document.positionAt(selectionRange.startIndex + forwardShift),
                        this.document.positionAt(selectionRange.endIndex + forwardShift)
                    );
                    break;
                }
            }

            return ok(newSelection);
        } finally {
            this.moveSelectionLock = false;
        }
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

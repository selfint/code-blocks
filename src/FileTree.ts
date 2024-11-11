import * as vscode from "vscode";

import { Block, getQueryBlocks } from "./BlockTree";
import Parser, { Query, SyntaxNode, Tree } from "tree-sitter";
import { Result, err, ok } from "./result";

import { Language } from "./Installer";
import { Selection } from "./Selection";
import { getLanguageConfig } from "./configuration";
import { getLogger } from "./outputChannel";
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

export type MoveSelectionDirection = "swap-previous" | "swap-next" | "after-parent" | "before-parent";
export class FileTree implements vscode.Disposable {
    public parser: Parser;
    public tree: Tree;
    public blocks: Block[] | undefined = undefined;
    public document: vscode.TextDocument;
    public version: number;

    private queries: Query[] | undefined;

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
            const language = parser.getLanguage() as Language;
            this.queries = queryStrings.map((q) => new Query(language, q));
            this.blocks = getQueryBlocks(this.tree.rootNode, this.queries);
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

    async dispose(): Promise<void> {
        // this.tree.delete();
        await Promise.all(
            this.disposables.map(async (d) => {
                await d.dispose();
            })
        );
    }

    public static async new(
        language: Language,
        document: vscode.TextDocument
    ): Promise<Result<FileTree, unknown>> {
        await parserFinishedInit;
        const parser = new Parser();
        const logger = getLogger();
        try {
            logger.log(
                `Setting language for parser, language !== undefined = ${JSON.stringify(
                    // sanity check
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    language !== undefined
                )}`
            );
            parser.setLanguage(language);
        } catch (error) {
            logger.log(`Error setting language for parser: ${JSON.stringify(error)}`);
            return err(error);
        }

        return ok(new FileTree(parser, document));
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
        if (this.queries !== undefined) {
            this.blocks = getQueryBlocks(this.tree.rootNode, this.queries);
        }
        this.version = event.document.version;
        this.onUpdateEmitter.fire();
    }

    public selectBlock(cursorIndex: number): Selection | undefined {
        const nodeAtCursor = this.tree.rootNode.namedDescendantForIndex(cursorIndex);
        // ignore root nodes, probably only includes 'file' - like nodes
        // TODO: test more parsers to ensure this is always the correct action
        if (nodeAtCursor.parent === null) {
            return undefined;
        }

        return Selection.fromNode(nodeAtCursor, this.version).expandToBlock(this.blocks);
    }

    public resolveVscodeSelection(vscodeSelection: vscode.Selection): Selection | undefined {
        if (vscodeSelection.start.isEqual(vscodeSelection.end)) {
            return this.selectBlock(this.document.offsetAt(vscodeSelection.start));
        }

        const root = this.tree.rootNode;
        const startNode = root.namedDescendantForPosition(positionToPoint(vscodeSelection.start));
        const endPosition = positionToPoint(vscodeSelection.end);
        // we want an inclusive range, but vscode.Selection has an exclusive end value
        endPosition.column -= 1;
        const endNode = root.namedDescendantForPosition(endPosition);

        if (startNode === endNode) {
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
            endParents.some((endParent) => endParent === startParent)
        );
        const endParentInStartParents = endParents.findIndex((endParent) =>
            startParents.some((startParent) => startParent === endParent)
        );

        let lowestCommonParent: SyntaxNode;
        if (0 <= startParentInEndParents && startParentInEndParents <= endParentInStartParents) {
            lowestCommonParent = startParents[startParentInEndParents];
        } else if (0 <= endParentInStartParents) {
            lowestCommonParent = endParents[endParentInStartParents];
        } else {
            // should be impossible
            throw new Error("got start and end nodes without a common parent");
        }

        // if we are selecting all the nodes in the lowest common parent
        // we are selecting the parent
        if (
            startNode.startIndex === lowestCommonParent.startIndex &&
            endNode.endIndex === lowestCommonParent.endIndex
        ) {
            return Selection.fromNode(lowestCommonParent, this.version);
        }

        // get all named children in the common parent from start to end nodes
        const selectedNodes = lowestCommonParent.namedChildren.filter(
            (child) => child.endIndex > startNode.startIndex && child.startIndex <= endNode.endIndex
        );

        // TODO: aren't the nodes already sorted? check if we can remove this
        selectedNodes.sort((a, b) => a.startIndex - b.startIndex);

        return new Selection(selectedNodes, this.version);
    }

    public getSelectionText(selection: Selection): string {
        return this.document.getText(selection.toVscodeSelection());
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
            const selectionRange = selection.getRange();
            const vscodeSelection = selection.toVscodeSelection();
            const selectionText = this.document.getText(vscodeSelection);
            let newSelection: vscode.Selection;

            // const selectionNode = selection.firstNode();
            // const queriesRoot = selectionNode.parent?.parent ?? selectionNode.parent;
            const blocks = this.blocks;
            // if (blocks === undefined) {
            //     blocks = this.queries && queriesRoot ? getQueryBlocks(queriesRoot, this.queries) : [];
            // }

            switch (direction) {
                case "swap-previous": {
                    const previousSelection = selection.getPrevious(blocks);
                    if (!previousSelection) {
                        return err(`Can't move to ${direction}, previous node of selection is undefined`);
                    }

                    const previousRange = previousSelection.getRange();
                    const previousVscodeSelection = previousSelection.toVscodeSelection();

                    // swap previous node text and selection text
                    edit.replace(
                        this.document.uri,
                        vscodeSelection,
                        this.document.getText(previousSelection.toVscodeSelection())
                    );
                    edit.replace(this.document.uri, previousVscodeSelection, selectionText);

                    // cache previous node start index before edit
                    // since the tree will catch the edit, and the next node's
                    // start/end indices will change
                    const previousNodeStartIndex = previousRange.startIndex;
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
                    const nextSelection = selection.getNext(blocks);
                    if (!nextSelection) {
                        return err(`Can't move to ${direction}, next node of selection is null`);
                    }

                    const nextRange = nextSelection.getRange();
                    const nextVscodeSelection = nextSelection.toVscodeSelection();

                    // swap next node text and selection text
                    edit.replace(this.document.uri, nextVscodeSelection, selectionText);
                    edit.replace(
                        this.document.uri,
                        vscodeSelection,
                        this.document.getText(nextVscodeSelection)
                    );

                    // calculate forward index shift before applying edit
                    // since the tree will catch the edit, and the next node's
                    // start/end indices will change
                    const forwardShift = nextRange.endIndex - selectionRange.endIndex;
                    await vscode.workspace.applyEdit(edit);

                    // end index is exclusive, so selection *really* ends at endIndex - 1
                    newSelection = new vscode.Selection(
                        this.document.positionAt(selectionRange.startIndex + forwardShift),
                        this.document.positionAt(selectionRange.endIndex + forwardShift)
                    );
                    break;
                }
                case "after-parent":
                    return this.afterParent(selection, blocks);
                case "before-parent":
                    return this.beforeParent(selection, blocks);
            }

            return ok(newSelection);
        } finally {
            this.moveSelectionLock = false;
        }
    }

    private async beforeParent(
        selection: Selection,
        blocks: Block[] | undefined
    ): Promise<Result<vscode.Selection, string>> {
        const edit = new vscode.WorkspaceEdit();
        const vscodeSelection = selection.toVscodeSelection();
        const selectionText = this.document.getText(vscodeSelection);
        const selectionRange = selection.getRange();

        const parent = selection.getParent(blocks);
        if (!parent) {
            return err("Can't move to after-parent, parent node of selection is null");
        }

        const parentRange = parent.getRange();

        const nextNamedSibling = parent.getNext(blocks);
        const previousNamedSibling = parent.getPrevious(blocks);

        let newBeforeSpacing =
            previousNamedSibling === undefined
                ? undefined
                : this.document.getText(
                      new vscode.Selection(
                          this.document.positionAt(previousNamedSibling.getRange().endIndex + 1),
                          this.document.positionAt(parentRange.startIndex)
                      )
                  );

        let newAfterSpacing =
            nextNamedSibling === undefined
                ? undefined
                : this.document.getText(
                      new vscode.Selection(
                          this.document.positionAt(parentRange.endIndex + 1),
                          this.document.positionAt(nextNamedSibling.getRange().startIndex)
                      )
                  );

        // try to fill in the spaces as best we can
        newBeforeSpacing = newBeforeSpacing ?? newAfterSpacing ?? "";
        newAfterSpacing = newAfterSpacing ?? newBeforeSpacing;

        const newText = selectionText + newAfterSpacing;
        // remove old selection
        edit.replace(this.document.uri, parserRangeToVscodeRange(selectionRange), "");
        // insert new selection
        edit.insert(this.document.uri, pointToPosition(parentRange.startPosition), newText);

        const selectionLength = selectionRange.endIndex - selectionRange.startIndex;
        const newStartIndex = parentRange.startIndex;
        await vscode.workspace.applyEdit(edit);

        const newSelection = new vscode.Selection(
            this.document.positionAt(newStartIndex),
            this.document.positionAt(newStartIndex + selectionLength)
        );

        return ok(newSelection);
    }

    private async afterParent(
        selection: Selection,
        blocks: Block[] | undefined
    ): Promise<Result<vscode.Selection, string>> {
        const edit = new vscode.WorkspaceEdit();
        const vscodeSelection = selection.toVscodeSelection();
        const selectionText = this.document.getText(vscodeSelection);
        const selectionRange = selection.getRange();

        const parent = selection.getParent(blocks);
        if (!parent) {
            return err("Can't move to after-parent, parent node of selection is null");
        }

        const parentRange = parent.getRange();

        const nextNamedSibling = parent.getNext(blocks);
        const previousNamedSibling = parent.getPrevious(blocks);

        let newBeforeSpacing =
            previousNamedSibling === undefined
                ? undefined
                : this.document.getText(
                      new vscode.Selection(
                          this.document.positionAt(previousNamedSibling.getRange().endIndex + 1),
                          this.document.positionAt(parentRange.startIndex)
                      )
                  );

        let newAfterSpacing =
            nextNamedSibling === undefined
                ? undefined
                : this.document.getText(
                      new vscode.Selection(
                          this.document.positionAt(parentRange.endIndex + 1),
                          this.document.positionAt(nextNamedSibling.getRange().startIndex)
                      )
                  );

        // try to fill in the spaces as best we can
        newBeforeSpacing = newBeforeSpacing ?? newAfterSpacing ?? "";
        newAfterSpacing = newAfterSpacing ?? newBeforeSpacing;

        const newText = newBeforeSpacing + selectionText + newAfterSpacing;
        // insert new selection
        edit.insert(this.document.uri, pointToPosition(parentRange.endPosition), newText);
        // remove old selection
        edit.replace(this.document.uri, parserRangeToVscodeRange(selectionRange), "");

        const selectionLength = selectionRange.endIndex - selectionRange.startIndex;
        const newStartIndex = parentRange.endIndex - selectionLength + newBeforeSpacing.length;
        await vscode.workspace.applyEdit(edit);

        const newSelection = new vscode.Selection(
            this.document.positionAt(newStartIndex),
            this.document.positionAt(newStartIndex + selectionLength)
        );

        return ok(newSelection);
    }

    public async teleportSelection(
        selection: Selection,
        targetSelection: Selection,
        blocks: Block[]
    ): Promise<Result<vscode.Selection, string>> {
        if (this.version !== this.document.version) {
            return err("Can't teleport selection since tree version != document version");
        }

        if (selection.toVscodeSelection().contains(targetSelection.toVscodeSelection())) {
            return err("Can't teleport selection into target selection it contains");
        }

        const edit = new vscode.WorkspaceEdit();
        const selectionText = selection.getText(this.document.getText());
        const selectionRange = selection.getRange();

        const targetSelectionRange = targetSelection.getRange();

        const nextNamedSibling = targetSelection.getNext(blocks);
        const previousNamedSibling = targetSelection.getPrevious(blocks);

        // try to fill in the spaces as best we can
        // default to empty string
        let newBeforeSpacing = "";
        // first check for spacing between the previous sibling
        if (previousNamedSibling) {
            newBeforeSpacing = this.document.getText(
                new vscode.Selection(
                    this.document.positionAt(previousNamedSibling.getRange().endIndex),
                    this.document.positionAt(targetSelectionRange.startIndex)
                )
            );
        }
        // then check for spacing between the next sibling
        else if (nextNamedSibling) {
            this.document.getText(
                new vscode.Selection(
                    this.document.positionAt(targetSelectionRange.endIndex),
                    this.document.positionAt(nextNamedSibling.getRange().startIndex)
                )
            );
        }

        const newText = newBeforeSpacing + selectionText;

        if (targetSelectionRange.endIndex > selectionRange.startIndex) {
            // insert new selection
            edit.insert(this.document.uri, pointToPosition(targetSelectionRange.endPosition), newText);
            // remove old selection
            edit.replace(this.document.uri, parserRangeToVscodeRange(selectionRange), "");

            const selectionLength = selectionRange.endIndex - selectionRange.startIndex;
            const newStartIndex = targetSelectionRange.endIndex - selectionLength + newBeforeSpacing.length;
            await vscode.workspace.applyEdit(edit);

            const newSelection = new vscode.Selection(
                this.document.positionAt(newStartIndex),
                this.document.positionAt(newStartIndex + selectionLength)
            );

            return ok(newSelection);
        } else {
            // remove old selection
            edit.replace(this.document.uri, parserRangeToVscodeRange(selectionRange), "");
            // insert new selection
            edit.insert(this.document.uri, pointToPosition(targetSelectionRange.endPosition), newText);

            const selectionLength = selectionRange.endIndex - selectionRange.startIndex;
            const newStartIndex = targetSelectionRange.endIndex + newBeforeSpacing.length;
            await vscode.workspace.applyEdit(edit);

            const newSelection = new vscode.Selection(
                this.document.positionAt(newStartIndex),
                this.document.positionAt(newStartIndex + selectionLength)
            );

            return ok(newSelection);
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

import * as vscode from "vscode";
import { Range, SyntaxNode } from "web-tree-sitter";
import { pointToPosition } from "./FileTree";

export type UpdateSelectionDirection =
    | "add-previous"
    | "add-next"
    | "remove-previous"
    | "remove-next"
    | "parent"
    | "child";

export class Selection {
    public constructor(
        /**
         * List of nodes representing the currently selected nodes.
         */
        private selectedSiblings: SyntaxNode[],
        public version: number
    ) {}

    public static fromNode(node: SyntaxNode, version: number): Selection {
        // some nodes contain a single node that is their entire range
        // this is confusing when looking only at the text.
        // to avoid confusion, we will always default to the highest
        // node in the hierarchy that contains the same range
        // as its children
        while (
            node.parent?.namedChildCount === 1 &&
            node.parent.startIndex === node.startIndex &&
            node.parent.endIndex === node.endIndex
        ) {
            node = node.parent;
        }
        return new Selection([node], version);
    }

    public getText(text: string): string {
        const selectionRange = this.getRange();
        const selectionText = text.substring(selectionRange.startIndex, selectionRange.endIndex);

        return selectionText;
    }

    public getPrevious(): SyntaxNode | undefined {
        return this.selectedSiblings[0].previousNamedSibling ?? undefined;
    }

    public getNext(): SyntaxNode | undefined {
        return this.selectedSiblings.at(-1)?.nextNamedSibling ?? undefined;
    }

    public getParent(): SyntaxNode | undefined {
        const selectionRange = this.getRange();
        let parent = this.selectedSiblings[0].parent;

        // recurse out of parent until it has a different range than the current selection
        while (
            parent?.parent &&
            parent.startIndex === selectionRange.startIndex &&
            parent.endIndex === selectionRange.endIndex
        ) {
            parent = parent.parent;
        }

        return parent ?? undefined;
    }

    public getChild(): SyntaxNode | undefined {
        const selectionRange = this.getRange();
        let child = this.selectedSiblings[0].firstNamedChild;

        // recurse into child until it has a different range than the current selection
        while (
            child?.firstNamedChild &&
            child.startIndex === selectionRange.startIndex &&
            child.endIndex === selectionRange.endIndex
        ) {
            child = child.firstNamedChild;
        }

        return child ?? undefined;
    }

    public update(direction: UpdateSelectionDirection): void {
        // TODO: respect block mode
        // also, in block mode, maybe we can add 'ignored' nodes
        // which are always skipped and we go to their parent or something?
        switch (direction) {
            case "add-previous":
                {
                    const prevSibling = this.getPrevious();
                    if (prevSibling) {
                        this.selectedSiblings.splice(0, 0, prevSibling);
                    }
                }
                break;

            case "remove-previous":
                if (this.selectedSiblings.length > 1) {
                    this.selectedSiblings.splice(0, 1);
                }
                break;

            case "add-next":
                {
                    const nextSibling = this.getNext();
                    if (nextSibling) {
                        this.selectedSiblings.push(nextSibling);
                    }
                }
                break;

            case "remove-next":
                if (this.selectedSiblings.length > 1) {
                    this.selectedSiblings.pop();
                }
                break;

            case "parent":
                {
                    const parent = this.getParent();
                    if (parent) {
                        this.selectedSiblings = [parent];
                    }
                }
                break;

            case "child":
                {
                    const child = this.getChild();
                    if (child) {
                        this.selectedSiblings = [child];
                    }
                }
                break;
        }
    }

    public getRange(): Range {
        const firstNode = this.selectedSiblings[0];
        const lastNode = this.selectedSiblings[this.selectedSiblings.length - 1];

        return {
            startIndex: firstNode.startIndex,
            endIndex: lastNode.endIndex,
            startPosition: firstNode.startPosition,
            endPosition: lastNode.endPosition,
        };
    }

    public toVscodeSelection(): vscode.Selection {
        const range = this.getRange();
        return new vscode.Selection(pointToPosition(range.startPosition), pointToPosition(range.endPosition));
    }
}

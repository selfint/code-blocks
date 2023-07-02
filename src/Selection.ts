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
         * List of nodes representing selection node start -> parent -> grandparent -> ... -> current.
         */
        public ancestryChain: SyntaxNode[],

        /**
         * List of nodes representing the currently selected nodes.
         */
        public selectedSiblings: SyntaxNode[],
        public version: number
    ) {}

    public static fromNode(node: SyntaxNode, version: number): Selection {
        return new Selection([node], [node], version);
    }

    public getText(text: string): string {
        const selectionRange = this.getRange();
        const selectionText = text.substring(selectionRange.startIndex, selectionRange.endIndex);

        return selectionText;
    }

    public update(direction: UpdateSelectionDirection): void {
        const prevSibling = this.selectedSiblings.at(0)?.previousNamedSibling ?? undefined;
        const nextSibling = this.selectedSiblings.at(-1)?.nextNamedSibling ?? undefined;

        const parent = this.ancestryChain.at(-1)?.parent ?? undefined;
        const child = this.ancestryChain.at(-2) ?? undefined;

        // TODO: respect block mode
        // also, in block mode, maybe we can add 'ignored' nodes
        // which are always skipped and we go to their parent or something?
        switch (direction) {
            case "add-previous":
                if (prevSibling !== undefined) {
                    this.selectedSiblings.splice(0, 0, prevSibling);
                }
                break;

            case "remove-previous":
                if (this.selectedSiblings.length >= 2) {
                    this.selectedSiblings.splice(0, 1);
                }
                break;

            case "add-next":
                if (nextSibling !== undefined) {
                    this.selectedSiblings.push(nextSibling);
                }
                break;

            case "remove-next":
                if (this.selectedSiblings.length >= 2) {
                    this.selectedSiblings.pop();
                }
                break;

            case "parent":
                if (parent !== undefined) {
                    this.selectedSiblings = [parent];
                    this.ancestryChain.push(parent);
                }
                break;

            case "child":
                if (child !== undefined) {
                    this.selectedSiblings = [child];
                    this.ancestryChain.pop();
                }
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

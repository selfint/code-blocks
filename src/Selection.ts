import * as vscode from "vscode";
import { Range, SyntaxNode } from "web-tree-sitter";
import { Block } from "./BlockTree";
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
            node.parent &&
            node.parent.startIndex === node.startIndex &&
            node.parent.endIndex === node.endIndex
        ) {
            node = node.parent;
        }
        return new Selection([node], version);
    }

    public firstNode(): SyntaxNode {
        return this.selectedSiblings[0];
    }

    public getText(text: string): string {
        const selectionRange = this.getRange();
        const selectionText = text.substring(selectionRange.startIndex, selectionRange.endIndex);

        return selectionText;
    }

    public getLength(): number {
        return (
            this.selectedSiblings[this.selectedSiblings.length - 1].endIndex -
            this.selectedSiblings[0].startIndex
        );
    }

    expandToBlock(blocks: Block[] | undefined): this {
        if (blocks === undefined || blocks.length === 0) {
            return this;
        }

        const parent = this.firstNode().parent;
        const range = this.getRange();

        let smallestBlockIndex: number | undefined = undefined;
        let smallestBlockLength: number | undefined = undefined;
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];

            const blockRange = {
                startIndex: block[0].startIndex,
                endIndex: block[block.length - 1].endIndex,
            };

            // check if block contains selection
            if (blockRange.startIndex <= range.startIndex && range.endIndex <= blockRange.endIndex) {
                // check if block is at the same hierarchy level as the selection
                if (
                    (parent === null && block[0].parent === null) ||
                    (block[0].parent !== null && parent?.equals(block[0].parent))
                ) {
                    const length = blockRange.endIndex - blockRange.startIndex;
                    if (length <= (smallestBlockLength ?? length)) {
                        smallestBlockIndex = i;
                        smallestBlockLength = length;
                    }
                }
            }
        }

        if (smallestBlockIndex !== undefined) {
            const smallestBlock = blocks[smallestBlockIndex];
            this.selectedSiblings = smallestBlock;
        }

        return this;
    }

    public getPrevious(blocks: Block[] | undefined): Selection | undefined {
        const previousNode = this.selectedSiblings[0].previousNamedSibling;
        if (previousNode) {
            return new Selection([previousNode], this.version).expandToBlock(blocks);
        } else {
            return undefined;
        }
    }

    public getNext(blocks: Block[] | undefined): Selection | undefined {
        const nextNode = this.selectedSiblings.at(-1)?.nextNamedSibling;
        if (nextNode) {
            return new Selection([nextNode], this.version).expandToBlock(blocks);
        } else {
            return undefined;
        }
    }

    public getParent(blocks: Block[] | undefined): Selection | undefined {
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

        if (parent) {
            return new Selection([parent], this.version).expandToBlock(blocks);
        } else {
            return undefined;
        }
    }

    public getChild(blocks: Block[] | undefined): Selection | undefined {
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

        if (child) {
            return new Selection([child], this.version).expandToBlock(blocks);
        } else {
            return undefined;
        }
    }

    with(selection: Selection): this {
        const range = this.getRange();
        let didUpdate = false;
        for (const selectedSibling of selection.selectedSiblings) {
            if (
                range.startIndex <= selectedSibling.startIndex &&
                selectedSibling.endIndex <= range.endIndex
            ) {
                continue;
            }

            didUpdate = true;
            this.selectedSiblings.push(selectedSibling);
        }

        if (didUpdate) {
            this.selectedSiblings.sort((a, b) => a.startIndex - b.startIndex);
        }

        return this;
    }

    public update(direction: UpdateSelectionDirection, blocks: Block[] | undefined): this {
        switch (direction) {
            case "add-previous": {
                const prevSibling = this.getPrevious(blocks);
                return prevSibling ? this.with(prevSibling) : this;
            }

            case "remove-previous":
                if (this.selectedSiblings.length > 1) {
                    this.selectedSiblings.splice(0, 1);
                }
                return this;

            case "add-next": {
                const nextSibling = this.getNext(blocks);
                return nextSibling ? this.with(nextSibling) : this;
            }

            case "remove-next":
                if (this.selectedSiblings.length > 1) {
                    this.selectedSiblings.pop();
                }
                return this;

            case "parent":
                {
                    const parent = this.getParent(blocks);
                    if (parent) {
                        this.selectedSiblings = parent.selectedSiblings;
                    }
                }
                return this;

            case "child":
                {
                    const child = this.getChild(blocks);
                    if (child) {
                        this.selectedSiblings = child.selectedSiblings;
                    }
                }
                return this;
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

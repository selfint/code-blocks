import { Point, SyntaxNode } from "web-tree-sitter";

export type UpdateSelectionDirection =
    | "add-previous"
    | "add-next"
    | "remove-previous"
    | "remove-next"
    | "parent"
    | "child";

export class Selection {
    /**
     * List of nodes representing selection node start -> parent -> grandparent -> ... -> current.
     */
    public ancestryChain: SyntaxNode[];

    /**
     * List of nodes representing the currently selected nodes.
     */
    public selectedSiblings: SyntaxNode[];

    public version: number;

    public constructor(node: SyntaxNode, version: number) {
        this.ancestryChain = [node];
        this.selectedSiblings = [node];
        this.version = version;
    }

    public getText(text: string): string {
        const selectionRange = this.getRange();
        const selectionText = text.substring(selectionRange.start, selectionRange.end);

        return selectionText;
    }

    public update(direction: UpdateSelectionDirection): void {
        const prevSibling = this.selectedSiblings.at(0)?.previousNamedSibling ?? undefined;
        const nextSibling = this.selectedSiblings.at(-1)?.nextNamedSibling ?? undefined;

        const parent = this.ancestryChain.at(-1)?.parent ?? undefined;
        const child = this.ancestryChain.at(-2) ?? undefined;

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

    public getRange(): { start: number; end: number; startPosition: Point; endPosition: Point } {
        const firstNode = this.selectedSiblings[0];
        const lastNode = this.selectedSiblings[this.selectedSiblings.length - 1];

        return {
            start: firstNode.startIndex,
            end: lastNode.endIndex,
            startPosition: firstNode.startPosition,
            endPosition: lastNode.endPosition,
        };
    }
}

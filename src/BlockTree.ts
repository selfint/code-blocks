import { Query, SyntaxNode, Tree, TreeCursor } from "web-tree-sitter";

export type Block = SyntaxNode[];
export type BlockTree = {
    block: Block;
    children: BlockTree[];
};

export function getBlockTrees(tree: Tree, queries: Query[]): BlockTree[] {
    const blocks = getQueryBlocks(tree.rootNode, queries);

    return buildBlockTrees(blocks, tree.walk());
}

export function getQueryBlocks(root: SyntaxNode, queries: Query[]): Block[] {
    const blocks = [];

    for (const query of queries) {
        const matches = query.matches(root);

        for (const match of matches) {
            const block = [];
            for (const capture of match.captures) {
                block.push(capture.node);
            }
            block.sort((a, b) => a.startIndex - b.startIndex);

            blocks.push(block);
        }
    }

    return blocks;
}

function buildBlockTrees(blocks: Block[], cursor: TreeCursor): BlockTree[] {
    const node = cursor.currentNode();
    let trees: BlockTree[] = [];

    if (cursor.gotoFirstChild()) {
        const children = buildBlockTrees(blocks, cursor);
        const blockIndex = blocks.findIndex((block) => block.at(-1)?.equals(node));

        if (blockIndex !== -1) {
            const block = blocks.splice(blockIndex, 1)[0];
            trees.push({ block: block, children });
        } else {
            trees = trees.concat(children);
        }

        cursor.gotoParent();
    }

    if (cursor.gotoNextSibling()) {
        trees = trees.concat(buildBlockTrees(blocks, cursor));
    }

    return trees;
}

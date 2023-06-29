import { Query, SyntaxNode, Tree, TreeCursor } from "web-tree-sitter";

export type Block = SyntaxNode[];
export type BlockTree = {
    block: Block;
    children: BlockTree[];
};

export function getBlockTrees(tree: Tree, queries: Query[]): BlockTree[] {
    const blocks = getQueryBlocks(tree, queries);

    return buildBlockTrees(blocks, tree.walk());
}

function getQueryBlocks(tree: Tree, queries: Query[]): Block[] {
    const root = tree.rootNode;
    const blocks = [];

    for (const query of queries) {
        const captures = query.captures(root);
        const block = [];
        for (const capture of captures) {
            block.push(capture.node);
        }

        block.sort((a, b) => a.startIndex - b.startIndex);

        blocks.push(block);
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

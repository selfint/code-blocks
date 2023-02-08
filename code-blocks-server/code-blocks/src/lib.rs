use std::ops::Range;

use anyhow::{anyhow, Result};
use tree_sitter::{Node, Query, QueryCursor, Tree, TreeCursor};

#[derive(PartialEq, Eq, Clone, Hash, Debug)]
pub struct BlockTree<'tree> {
    pub block: Block<'tree>,
    pub children: Vec<BlockTree<'tree>>,
}

#[derive(PartialEq, Eq, Clone, Hash, Debug)]
pub struct Block<'tree> {
    pub nodes: Vec<Node<'tree>>,
}

impl<'tree> Block<'tree> {
    pub fn head(&self) -> Option<&Node<'tree>> {
        self.nodes.first()
    }

    pub fn tail(&self) -> Option<&Node<'tree>> {
        self.nodes.last()
    }

    pub fn head_tail(&self) -> (Option<&Node<'tree>>, Option<&Node<'tree>>) {
        (self.head(), self.tail())
    }

    pub fn byte_range(&self) -> Option<Range<usize>> {
        Some(self.head()?.start_byte()..self.tail()?.end_byte())
    }
}

pub fn get_query_subtrees<'tree>(
    queries: &[Query],
    tree: &'tree Tree,
    text: &str,
) -> Vec<BlockTree<'tree>> {
    let mut blocks = get_blocks(queries, tree, text);

    dbg!(tree.root_node().to_sexp());

    build_block_tree(&mut blocks, &mut tree.walk())
}

pub fn move_block<'tree>(
    src_item: Block<'tree>,
    dst_item: Block<'tree>,
    text: &str,
) -> Result<String> {
    let (Some(src_head), Some(src_tail)) = src_item.head_tail() else {
        return Err(anyhow!("Can't move empty block"));
    };

    let (Some(dst_head), Some(dst_tail)) = dst_item.head_tail() else {
        return Err(anyhow!("Can't move empty block"));
    };

    let Some(src_block_range) = src_item.byte_range() else {
        return Err(anyhow!("Can't move empty block"));
    };

    if src_head.parent() != dst_head.parent() {
        dbg!((src_head.parent(), dst_head.parent()));
        return Err(anyhow!("Can't move items to different scopes"));
    }

    if src_head.start_position() == dst_head.start_position() {
        return Ok(text.to_string());
    }

    let mut new_text = text.to_string();

    let src_text = &text[src_block_range.clone()];

    let spaces = [
        src_head
            .prev_sibling()
            .map(|s| &text[s.end_byte()..src_head.start_byte()]),
        src_tail
            .next_sibling()
            .map(|s| &text[src_tail.end_byte()..s.start_byte()]),
        dst_head
            .prev_sibling()
            .map(|s| &text[s.end_byte()..dst_head.start_byte()]),
        dst_tail
            .next_sibling()
            .map(|s| &text[dst_tail.end_byte()..s.start_byte()]),
    ];

    let max_space = spaces
        .into_iter()
        .flatten()
        .max_by(|s1, s2| s1.len().cmp(&s2.len()))
        .unwrap_or_default();

    let src_range = match (src_head.prev_sibling(), src_tail.next_sibling()) {
        (Some(p), Some(n)) => {
            let p_space = p.end_byte()..src_tail.end_byte();
            let n_space = src_head.start_byte()..n.start_byte();

            if p_space.len() >= n_space.len() {
                p_space
            } else {
                n_space
            }
        }
        (None, Some(n)) => src_head.start_byte()..n.start_byte(),
        (Some(p), None) => p.end_byte()..src_tail.end_byte(),
        (None, None) => src_block_range,
    };

    // move src to be below dst
    if src_head.start_byte() < dst_head.start_byte() {
        new_text.insert_str(dst_tail.end_byte(), src_text);
        new_text.insert_str(dst_tail.end_byte(), max_space);
        new_text.replace_range(src_range, "");
    } else {
        new_text.replace_range(src_range, "");
        new_text.insert_str(dst_tail.end_byte(), src_text);
        new_text.insert_str(dst_tail.end_byte(), max_space);
    }

    Ok(new_text)
}

fn get_blocks<'tree>(queries: &[Query], tree: &'tree Tree, text: &str) -> Vec<Block<'tree>> {
    let mut blocks = vec![];

    for query in queries {
        let mut query_cursor = QueryCursor::new();
        let captures = query_cursor.captures(query, tree.root_node(), text.as_bytes());

        for (q_match, index) in captures {
            if index != 0 {
                continue;
            }

            let mut block = vec![];
            for capture in q_match.captures {
                block.push((capture.index, capture.node));
            }

            block.sort_by(|(i1, _), (i2, _)| i1.cmp(i2));

            let nodes = block.into_iter().map(|(_, n)| n).collect::<Vec<_>>();

            blocks.push(Block { nodes });
        }
    }

    blocks
}

fn build_block_tree<'tree>(
    blocks: &mut Vec<Block<'tree>>,
    cursor: &mut TreeCursor<'tree>,
) -> Vec<BlockTree<'tree>> {
    let node = cursor.node();
    let mut trees = vec![];

    if cursor.goto_first_child() {
        let mut children = build_block_tree(blocks, cursor);

        if let Some(index) = blocks.iter().position(|b| b.tail() == Some(&node)) {
            let block = blocks.remove(index);
            trees.push(BlockTree { block, children });
        } else {
            trees.append(&mut children);
        }

        cursor.goto_parent();
    }

    if cursor.goto_next_sibling() {
        trees.append(&mut build_block_tree(blocks, cursor));
    }

    trees
}

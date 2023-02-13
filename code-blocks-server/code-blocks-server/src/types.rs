use code_blocks::{Block, BlockTree};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Clone, Hash, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BlockLocation {
    pub start_byte: usize,
    pub end_byte: usize,
    pub start_row: usize,
    pub start_col: usize,
    pub end_row: usize,
    pub end_col: usize,
}

impl From<Block<'_>> for BlockLocation {
    fn from(value: Block) -> Self {
        let (Some(head), Some(tail)) = value.head_tail() else {
            panic!("Got empty block");
        };

        Self {
            start_byte: head.start_byte(),
            end_byte: tail.end_byte(),
            start_row: head.start_position().row,
            start_col: head.start_position().column,
            end_row: tail.end_position().row,
            end_col: tail.end_position().column,
        }
    }
}

impl From<&Block<'_>> for BlockLocation {
    fn from(value: &Block) -> Self {
        let (Some(head), Some(tail)) = value.head_tail() else {
            panic!("Got empty block");
        };

        Self {
            start_byte: head.start_byte(),
            end_byte: tail.end_byte(),
            start_row: head.start_position().row,
            start_col: head.start_position().column,
            end_row: tail.end_position().row,
            end_col: tail.end_position().column,
        }
    }
}

#[derive(Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Clone, Hash, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BlockLocationTree {
    pub block: BlockLocation,
    pub children: Vec<BlockLocationTree>,
}

impl From<BlockTree<'_>> for BlockLocationTree {
    fn from(value: BlockTree<'_>) -> Self {
        Self {
            block: value.block.into(),
            children: value.children.iter().map(|c| c.into()).collect(),
        }
    }
}

impl From<&BlockTree<'_>> for BlockLocationTree {
    fn from(value: &BlockTree<'_>) -> Self {
        Self {
            block: value.block.clone().into(),
            children: value.children.iter().map(Into::into).collect(),
        }
    }
}

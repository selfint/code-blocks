use code_blocks::{Block, BlockTree};
use rocket::{post, serde::json::Json};
use serde::{Deserialize, Serialize};
use tree_sitter::{Language, Parser, Query, Tree};

#[derive(Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Clone, Hash, Debug, Default)]
pub struct BlockLocation {
    start_byte: usize,
    end_byte: usize,
    start_row: usize,
    start_col: usize,
    end_row: usize,
    end_col: usize,
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

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Copy, Hash, Debug)]
#[serde(rename_all = "lowercase")]
pub enum SupportedLanguage {
    Rust,
    TypeScript,
    TSX,
}

impl SupportedLanguage {
    pub fn get_language(&self) -> Language {
        match self {
            SupportedLanguage::Rust => tree_sitter_rust::language(),
            SupportedLanguage::TypeScript => tree_sitter_typescript::language_typescript(),
            SupportedLanguage::TSX => tree_sitter_typescript::language_tsx(),
        }
    }
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Hash, Debug)]
pub struct GetSubtreesArgs {
    pub items: Vec<String>,
    pub content: String,
    pub language: SupportedLanguage,
}

impl GetSubtreesArgs {
    pub fn get_language(&self) -> Language {
        self.language.get_language()
    }
}

#[derive(Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Clone, Hash, Debug)]
pub struct BlockLocationTree {
    block: BlockLocation,
    children: Vec<BlockLocationTree>,
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

pub type GetSubtreesResponse = Vec<BlockLocationTree>;

fn get_subtrees(args: GetSubtreesArgs) -> GetSubtreesResponse {
    let mut parser = Parser::new();
    let language = args.get_language();
    parser.set_language(language).unwrap();

    let text = args.content;
    let tree = parser.parse(&text, None).unwrap();

    let queries: Vec<Query> = args
        .items
        .iter()
        .map(|query| Query::new(language, query).unwrap())
        .collect();

    let items = code_blocks::get_query_subtrees(&queries, &tree, &text);

    items.iter().map(Into::into).collect()
}

#[post("/get_subtrees", data = "<args>")]
pub fn get_subtrees_endpoint(args: Json<GetSubtreesArgs>) -> Json<GetSubtreesResponse> {
    Json(get_subtrees(args.0))
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Hash, Debug)]
pub struct MoveItemArgs {
    pub item_types: Vec<String>,
    pub src_item: BlockLocation,
    pub dst_item: BlockLocation,
    pub content: String,
    pub language: SupportedLanguage,
}

impl MoveItemArgs {
    pub fn get_language(&self) -> Language {
        self.language.get_language()
    }
}

pub type MoveItemResponse = Result<String, String>;

fn copy_item_at<'tree>(
    location: &BlockLocation,
    trees: &Vec<BlockTree<'tree>>,
) -> Option<Block<'tree>> {
    for tree in trees {
        if &BlockLocation::from(&tree.block) == location {
            return Some(tree.block.clone());
        }

        if let Some(node) = copy_item_at(location, &tree.children) {
            return Some(node);
        }
    }

    None
}

pub fn build_tree(text: &str, language: Language) -> Tree {
    let mut parser = Parser::new();
    parser.set_language(language).unwrap();
    parser.parse(text, None).unwrap()
}

fn move_item(args: MoveItemArgs) -> MoveItemResponse {
    let language = args.get_language();
    let tree = build_tree(&args.content, language);

    let queries: Vec<Query> = args
        .item_types
        .iter()
        .map(|query| Query::new(language, query).unwrap())
        .collect();

    let items = code_blocks::get_query_subtrees(&queries, &tree, &args.content);

    let src_item = copy_item_at(&args.src_item, &items)
        .ok_or_else(|| "Failed to find source item".to_string())?;
    let dst_item = copy_item_at(&args.dst_item, &items)
        .ok_or_else(|| "Failed to find destination item".to_string())?;

    let new_content = code_blocks::move_block(src_item, dst_item, &args.content);

    match new_content {
        Ok(new_content) => Ok(new_content),
        Err(e) => Err(e.to_string()),
    }
}

#[post("/move_item", data = "<args>")]
pub fn move_item_endpoint(args: Json<MoveItemArgs>) -> Json<MoveItemResponse> {
    Json(move_item(args.0))
}

pub mod types;
use anyhow::{Context, Result};
use code_blocks::{Block, BlockTree};
use tree_sitter::{Language, Parser, Query};
pub use types::*;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Copy, Hash, Debug)]
#[serde(rename_all = "lowercase")]
pub enum SupportedLanguage {
    Rust,
    TypeScript,
    TSX,
    Svelte,
    Python,
}

impl SupportedLanguage {
    pub fn get_language(&self) -> Language {
        match self {
            SupportedLanguage::Rust => tree_sitter_rust::language(),
            SupportedLanguage::TypeScript => tree_sitter_typescript::language_typescript(),
            SupportedLanguage::TSX => tree_sitter_typescript::language_tsx(),
            SupportedLanguage::Svelte => tree_sitter_svelte::language(),
            SupportedLanguage::Python => tree_sitter_python::language(),
        }
    }
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Hash, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GetSubtreesArgs {
    pub queries: Vec<String>,
    pub text: String,
    pub language: SupportedLanguage,
}

pub type GetSubtreesResponse = Vec<BlockLocationTree>;

pub fn get_subtrees(args: GetSubtreesArgs) -> Result<GetSubtreesResponse> {
    let mut parser = Parser::new();
    let language = args.language.get_language();
    parser.set_language(language)?;

    let text = args.text;
    let tree = parser.parse(&text, None).context("Failed to parse text")?;

    let mut queries = vec![];
    for query in args.queries {
        queries.push(Query::new(language, &query)?);
    }

    let items = code_blocks::get_query_subtrees(&queries, &tree, &text);

    Ok(items.iter().map(Into::into).collect())
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Hash, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MoveBlockArgs {
    pub queries: Vec<String>,
    pub text: String,
    pub language: SupportedLanguage,
    pub src_block: BlockLocation,
    pub dst_block: BlockLocation,
}

impl MoveBlockArgs {
    pub fn get_language(&self) -> Language {
        self.language.get_language()
    }
}

pub type MoveBlockResponse = String;

pub fn move_block(args: MoveBlockArgs) -> Result<MoveBlockResponse> {
    fn copy_item_at<'tree>(
        location: &BlockLocation,
        trees: &[BlockTree<'tree>],
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

    let language = args.get_language();
    let mut parser = Parser::new();
    parser.set_language(language)?;
    let tree = parser
        .parse(&args.text, None)
        .context("Failed to parse text")?;

    let mut queries = vec![];
    for query in args.queries {
        queries.push(Query::new(language, &query)?);
    }
    let subtrees = code_blocks::get_query_subtrees(&queries, &tree, &args.text);

    let src_block = copy_item_at(&args.src_block, &subtrees).context("Failed to find src item")?;
    let dst_item = copy_item_at(&args.dst_block, &subtrees).context("Failed to find dst item")?;

    code_blocks::move_block(src_block, dst_item, &args.text)
}

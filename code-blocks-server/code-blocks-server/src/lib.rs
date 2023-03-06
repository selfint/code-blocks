pub mod types;
use std::path::PathBuf;

use anyhow::{Context, Result};
use code_blocks::{Block, BlockTree};
use tree_sitter::{Language, Parser, Query};
use tree_sitter_installer::parser_installer::{self, InstallationStatus};

pub use types::*;

#[derive(Debug)]
pub struct InstallLanguageArgs<F: FnMut(InstallationStatus)> {
    pub download_cmd: String,
    pub library_name: String,
    pub install_dir: PathBuf,
    pub report_progress: Option<F>,
}

pub type InstallLanguageResponse = PathBuf;

pub fn install_language<F: FnMut(InstallationStatus)>(
    args: InstallLanguageArgs<F>,
) -> Result<InstallLanguageResponse> {
    if !parser_installer::is_installed_at(&args.library_name, &args.install_dir) {
        parser_installer::install_parser(
            &args.download_cmd,
            &args.library_name,
            &args.install_dir,
            args.report_progress,
        )
    } else {
        Ok(parser_installer::get_compiled_lib_path(
            &args.library_name,
            &args.install_dir,
        ))
    }
}

#[derive(Debug)]
pub struct GetSubtreesArgs {
    pub queries: Vec<String>,
    pub text: String,
    pub language: Language,
}

pub type GetSubtreesResponse = Vec<BlockLocationTree>;

pub fn get_subtrees(args: GetSubtreesArgs) -> Result<GetSubtreesResponse> {
    let mut parser = Parser::new();
    parser.set_language(args.language)?;

    let text = args.text;
    let tree = parser.parse(&text, None).context("Failed to parse text")?;

    let mut queries = vec![];
    for query in args.queries {
        queries.push(Query::new(args.language, &query)?);
    }

    let items = code_blocks::get_query_subtrees(&queries, &tree, &text);

    Ok(items.iter().map(Into::into).collect())
}

#[derive(Debug)]
pub struct MoveBlockArgs<C: Fn(&Block, &Block) -> bool> {
    pub queries: Vec<String>,
    pub text: String,
    pub language: Language,
    pub src_block: BlockLocation,
    pub dst_block: BlockLocation,
    pub check_move_legal_fn: Option<C>,
    pub force: bool,
}

pub type MoveBlockResponse = String;

pub fn move_block<C: Fn(&Block, &Block) -> bool>(
    args: MoveBlockArgs<C>,
) -> Result<MoveBlockResponse> {
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

    let mut parser = Parser::new();
    parser.set_language(args.language)?;

    let tree = parser
        .parse(&args.text, None)
        .context("Failed to parse text")?;

    let mut queries = vec![];
    for query in args.queries {
        queries.push(Query::new(args.language, &query)?);
    }

    let subtrees = code_blocks::get_query_subtrees(&queries, &tree, &args.text);

    let src_block = copy_item_at(&args.src_block, &subtrees).context("Failed to find src item")?;
    let dst_item = copy_item_at(&args.dst_block, &subtrees).context("Failed to find dst item")?;

    code_blocks::move_block(
        src_block,
        dst_item,
        &args.text,
        args.check_move_legal_fn,
        args.force,
    )
}

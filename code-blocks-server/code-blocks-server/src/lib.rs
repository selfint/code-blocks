pub mod types;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use code_blocks::{Block, BlockTree};
use tree_sitter::{Language, Parser, Query, Tree};
use tree_sitter_installer::{DynamicParser, ParserInstaller, SupportedParser};

pub use types::*;

use serde::{Deserialize, Serialize};

// #[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Copy, Hash, Debug)]
// #[serde(rename_all = "lowercase")]
// pub enum SupportedDynamicLanguage {
//     Rust,
//     TypeScript,
//     TSX,
//     Svelte,
//     Python,
// }

// impl SupportedDynamicLanguage {
//     fn get_supported_parser(self) -> SupportedParser {
//         match self {
//             SupportedDynamicLanguage::Rust => SupportedParser::Rust,
//             SupportedDynamicLanguage::TypeScript => SupportedParser::TypeScript,
//             SupportedDynamicLanguage::TSX => SupportedParser::TSX,
//             SupportedDynamicLanguage::Svelte => SupportedParser::Svelte,
//             SupportedDynamicLanguage::Python => SupportedParser::Python,
//         }
//     }
// }

// #[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Hash, Debug)]
// #[serde(rename_all = "lowercase")]
// pub enum SupportedLanguage {
//     Rust,
//     TypeScript,
//     TSX,
//     Svelte,
//     Python,
//     #[serde(rename_all = "camelCase")]
//     SupportedDynamic {
//         language: SupportedDynamicLanguage,
//         install_dir: PathBuf,
//     },
//     #[serde(rename_all = "camelCase")]
//     Dynamic {
//         download_cmd: String,
//         symbol: String,
//         name: String,
//         install_dir: PathBuf,
//     },
// }

// pub enum LanguageProvider {
//     Standard { language: Language, parser: Parser },
//     Dynamic { parser: DynamicParser },
// }

// impl LanguageProvider {
//     pub fn parse(&mut self, text: impl AsRef<[u8]>, old_tree: Option<&Tree>) -> Option<Tree> {
//         match self {
//             LanguageProvider::Standard {
//                 language: _,
//                 parser,
//             } => parser.parse(text, old_tree),
//             LanguageProvider::Dynamic { parser } => parser.parse(text, old_tree),
//         }
//     }

//     pub fn build_query(&self, source: &str) -> Result<Query> {
//         match self {
//             LanguageProvider::Standard {
//                 language,
//                 parser: _,
//             } => Ok(Query::new(*language, source)?),
//             LanguageProvider::Dynamic { parser } => parser.build_query(source),
//         }
//     }
// }

// impl SupportedLanguage {
//     fn build_parser(&self, language: Language) -> Result<LanguageProvider> {
//         let mut parser = Parser::new();
//         parser.set_language(language)?;

//         Ok(LanguageProvider::Standard { language, parser })
//     }

//     fn build_dynamic_parser(
//         &self,
//         parser_installer: ParserInstaller,
//         install_dir: &Path,
//     ) -> Result<LanguageProvider> {
//         let parser = if parser_installer.is_installed_at(install_dir) {
//             parser_installer.load_parser(install_dir)?
//         } else {
//             parser_installer.install_parser(install_dir)?
//         };

//         Ok(LanguageProvider::Dynamic { parser })
//     }

//     pub fn get_provider(&self) -> Result<LanguageProvider> {
//         match self {
//             SupportedLanguage::Rust => self.build_parser(tree_sitter_rust::language()),
//             SupportedLanguage::TypeScript => {
//                 self.build_parser(tree_sitter_typescript::language_typescript())
//             }
//             SupportedLanguage::TSX => self.build_parser(tree_sitter_typescript::language_tsx()),
//             SupportedLanguage::Svelte => self.build_parser(tree_sitter_svelte::language()),
//             SupportedLanguage::Python => self.build_parser(tree_sitter_python::language()),
//             SupportedLanguage::SupportedDynamic {
//                 language: lang,
//                 install_dir,
//             } => {
//                 self.build_dynamic_parser(lang.get_supported_parser().get_installer(), install_dir)
//             }
//             SupportedLanguage::Dynamic {
//                 download_cmd,
//                 symbol,
//                 name,
//                 install_dir,
//             } => self.build_dynamic_parser(
//                 ParserInstaller {
//                     download_cmd: download_cmd.clone(),
//                     symbol: symbol.as_bytes().to_vec(),
//                     name: name.clone(),
//                 },
//                 install_dir,
//             ),
//         }
//     }
// }

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
pub struct MoveBlockArgs {
    pub queries: Vec<String>,
    pub text: String,
    pub language: Language,
    pub src_block: BlockLocation,
    pub dst_block: BlockLocation,
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

    code_blocks::move_block(src_block, dst_item, &args.text)
}

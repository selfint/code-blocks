use std::path::PathBuf;

use anyhow::{ensure, Result};
use code_blocks::Block;
use code_blocks_server::{
    BlockLocation, GetSubtreesArgs, GetSubtreesResponse, InstallLanguageArgs,
    InstallLanguageResponse, MoveBlockArgs, MoveBlockResponse,
};
use serde::{Deserialize, Serialize};
use tree_sitter_installer::{parser_installer::InstallationStatus, DynamicParser};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "method", content = "params")]
pub enum CliRequest {
    #[serde(rename_all = "camelCase")]
    InstallLanguage {
        download_cmd: String,
        library_name: String,
        install_dir: PathBuf,
    },
    #[serde(rename_all = "camelCase")]
    GetSubtrees {
        queries: Vec<String>,
        text: String,
        library_path: PathBuf,
        language_fn_symbol: String,
    },
    #[serde(rename_all = "camelCase")]
    MoveBlock {
        queries: Vec<String>,
        text: String,
        library_path: PathBuf,
        language_fn_symbol: String,
        src_block: BlockLocation,
        dst_block: BlockLocation,
        force: bool,
    },
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SerdeMoveBlockResponse {
    text: String,
    new_src_start: usize,
}

impl From<MoveBlockResponse> for SerdeMoveBlockResponse {
    fn from(from: MoveBlockResponse) -> Self {
        Self {
            text: from.text,
            new_src_start: from.new_src_start,
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum CliResponse {
    InstallLanguage(InstallLanguageResponse),
    GetSubtrees(GetSubtreesResponse),
    MoveBlock(SerdeMoveBlockResponse),
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "status", content = "result")]
pub enum JsonResult<T> {
    Ok(T),
    Progress(String),
    Error(String),
}

impl<T> From<Result<T>> for JsonResult<T> {
    fn from(value: Result<T>) -> Self {
        match value {
            Ok(ok) => JsonResult::Ok(ok),
            Err(err) => JsonResult::Error(format!("{:?}", err)),
        }
    }
}

fn main() {
    for line in std::io::stdin().lines() {
        let Ok(line) = line else { continue; };

        let response: JsonResult<CliResponse> = handle_line(&line).into();

        let Ok(response) = serde_json::to_string(&response) else {
            eprintln!("failed to serialize response");
            continue;
        };

        println!("{}", response);
    }
}

fn handle_line(line: &str) -> Result<CliResponse> {
    match serde_json::from_str::<CliRequest>(line)? {
        CliRequest::InstallLanguage {
            download_cmd,
            library_name,
            install_dir,
        } => Ok(CliResponse::InstallLanguage(
            code_blocks_server::install_language(InstallLanguageArgs {
                download_cmd,
                library_name,
                install_dir,
                report_progress: Some(|status| {
                    if let Ok(string) =
                        serde_json::to_string(&JsonResult::<()>::Progress(match status {
                            InstallationStatus::Downloading(string) => {
                                format!("Downloading: {}", string.trim())
                            }
                            InstallationStatus::Patching => "Patching".to_string(),
                            InstallationStatus::Compiling(string) => {
                                format!("Compiling: {}", string.trim())
                            }
                        }))
                    {
                        println!("{}", string);
                    } else {
                        eprintln!("failed to serialize progress");
                    }
                }),
            })?,
        )),
        CliRequest::GetSubtrees {
            queries,
            text,
            library_path,
            language_fn_symbol,
        } => {
            let dynamic_parser =
                DynamicParser::load_from(&library_path, language_fn_symbol.as_bytes())?;
            let language = dynamic_parser.get_language();

            Ok(CliResponse::GetSubtrees(code_blocks_server::get_subtrees(
                GetSubtreesArgs {
                    queries,
                    text,
                    language,
                },
            )?))
        }
        CliRequest::MoveBlock {
            queries,
            text,
            library_path,
            language_fn_symbol,
            src_block,
            dst_block,
            force,
        } => {
            let dynamic_parser =
                DynamicParser::load_from(&library_path, language_fn_symbol.as_bytes())?;
            let language = dynamic_parser.get_language();

            Ok(CliResponse::MoveBlock(
                code_blocks_server::move_block(MoveBlockArgs {
                    queries,
                    text,
                    language,
                    src_block,
                    dst_block,
                    assert_move_legal_fn: Some(assert_move_legal_fn),
                    force,
                })?
                .into(),
            ))
        }
    }
}

fn assert_move_legal_fn(src_block: &Block, dst_block: &Block) -> Result<()> {
    ensure!(
        src_block.head().parent() == dst_block.head().parent(),
        "Can't move block to different scope"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use anyhow::anyhow;
    use code_blocks_server::BlockLocation;

    use super::*;

    #[test]
    fn show_install_language_request() {
        let request = CliRequest::InstallLanguage {
            download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-rust".to_string(),
            library_name: "tree_sitter_rust".to_string(),
            install_dir: "path_to_install_dir".into(),
        };

        insta::assert_json_snapshot!(request,
            @r###"
        {
          "method": "installLanguage",
          "params": {
            "downloadCmd": "git clone https://github.com/tree-sitter/tree-sitter-rust",
            "libraryName": "tree_sitter_rust",
            "installDir": "path_to_install_dir"
          }
        }
        "###
        );
    }

    #[test]
    fn show_install_language_progress() {
        let progress = JsonResult::<()>::Progress("progress message".to_string());

        insta::assert_json_snapshot!(progress,
            @r###"
        {
          "status": "progress",
          "result": "progress message"
        }
        "###
        );
    }

    #[test]
    fn show_install_language_response() {
        let response = JsonResult::Ok(CliResponse::InstallLanguage(PathBuf::from(
            "path_to_installed_library",
        )));

        insta::assert_json_snapshot!(response,
            @r###"
        {
          "status": "ok",
          "result": "path_to_installed_library"
        }
        "###
        );
    }

    #[test]
    fn show_get_subtrees_request() {
        let request = CliRequest::GetSubtrees {
            queries: vec!["(function_item) @ident".to_string()],
            text: "fn main() {}\nfn foo() {}".to_string(),
            library_path: "path_to_installed_library".into(),
            language_fn_symbol: "language".to_string(),
        };
        insta::assert_json_snapshot!(request,
            @r###"
        {
          "method": "getSubtrees",
          "params": {
            "queries": [
              "(function_item) @ident"
            ],
            "text": "fn main() {}\nfn foo() {}",
            "libraryPath": "path_to_installed_library",
            "languageFnSymbol": "language"
          }
        }
        "###
        );
    }

    #[test]
    fn show_get_subtrees_response() {
        let server_response = code_blocks_server::get_subtrees(GetSubtreesArgs {
            queries: vec!["(function_item) @ident".to_string()],
            text: "fn main() {}\nfn foo() {}".to_string(),
            language: tree_sitter_rust::language(),
        })
        .unwrap();

        let response = JsonResult::Ok(CliResponse::GetSubtrees(server_response));

        insta::assert_json_snapshot!(response,
            @r###"
        {
          "status": "ok",
          "result": [
            {
              "block": {
                "startByte": 0,
                "endByte": 12,
                "startRow": 0,
                "startCol": 0,
                "endRow": 0,
                "endCol": 12
              },
              "children": []
            },
            {
              "block": {
                "startByte": 13,
                "endByte": 24,
                "startRow": 1,
                "startCol": 0,
                "endRow": 1,
                "endCol": 11
              },
              "children": []
            }
          ]
        }
        "###
        );
    }

    #[test]
    fn show_move_block() {
        let request = CliRequest::MoveBlock {
            queries: vec!["(function_item) @ident".to_string()],
            text: "fn main() {}\nfn foo() {}".to_string(),
            library_path: "path_to_installed_library".into(),
            language_fn_symbol: "language".to_string(),
            src_block: BlockLocation {
                start_byte: 0,
                end_byte: 12,
                start_row: 0,
                start_col: 0,
                end_row: 0,
                end_col: 12,
            },
            dst_block: BlockLocation {
                start_byte: 13,
                end_byte: 24,
                start_row: 1,
                start_col: 0,
                end_row: 1,
                end_col: 11,
            },
            force: false,
        };

        insta::assert_json_snapshot!(request,
            @r###"
        {
          "method": "moveBlock",
          "params": {
            "queries": [
              "(function_item) @ident"
            ],
            "text": "fn main() {}\nfn foo() {}",
            "libraryPath": "path_to_installed_library",
            "languageFnSymbol": "language",
            "srcBlock": {
              "startByte": 0,
              "endByte": 12,
              "startRow": 0,
              "startCol": 0,
              "endRow": 0,
              "endCol": 12
            },
            "dstBlock": {
              "startByte": 13,
              "endByte": 24,
              "startRow": 1,
              "startCol": 0,
              "endRow": 1,
              "endCol": 11
            },
            "force": false
          }
        }
        "###
        );
    }

    #[test]
    fn show_move_block_response() {
        let server_response = code_blocks_server::move_block(MoveBlockArgs {
            queries: vec!["(function_item) @ident".to_string()],
            text: "fn main() {}\nfn foo() {}".to_string(),
            language: tree_sitter_rust::language(),
            src_block: BlockLocation {
                start_byte: 0,
                end_byte: 12,
                start_row: 0,
                start_col: 0,
                end_row: 0,
                end_col: 12,
            },
            dst_block: BlockLocation {
                start_byte: 13,
                end_byte: 24,
                start_row: 1,
                start_col: 0,
                end_row: 1,
                end_col: 11,
            },
            assert_move_legal_fn: Some(assert_move_legal_fn),
            force: false,
        })
        .unwrap();

        let response = JsonResult::Ok(CliResponse::MoveBlock(server_response.into()));

        insta::assert_json_snapshot!(response,
            @r###"
        {
          "status": "ok",
          "result": {
            "text": "fn foo() {}\nfn main() {}",
            "newSrcStart": 24
          }
        }
        "###
        );
    }

    #[test]
    fn show_error() {
        let json_result_error: JsonResult<()> =
            Err(anyhow!("Error root").context("Error context")).into();

        insta::assert_json_snapshot!(json_result_error,
            @r###"
        {
          "status": "error",
          "result": "Error context\n\nCaused by:\n    Error root"
        }
        "###
        );
    }
}

use code_blocks_server::get_subtrees;
use code_blocks_server::move_block;
use code_blocks_server::{GetSubtreesArgs, GetSubtreesResponse};
use code_blocks_server::{MoveBlockArgs, MoveBlockResponse};
use rocket::{launch, post, routes, serde::json::Json};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "status", content = "result")]
pub enum JsonResult<T> {
    Ok(T),
    Error(String),
}

#[post("/get_subtrees", data = "<args>")]
pub fn get_subtrees_endpoint(args: Json<GetSubtreesArgs>) -> Json<JsonResult<GetSubtreesResponse>> {
    let result = match get_subtrees(args.0) {
        Ok(ok) => JsonResult::Ok(ok),
        Err(error) => JsonResult::Error(error.to_string()),
    };

    Json(result)
}

#[post("/move_block", data = "<args>")]
pub fn move_block_endpoint(args: Json<MoveBlockArgs>) -> Json<JsonResult<MoveBlockResponse>> {
    let result = match move_block(args.0) {
        Ok(ok) => JsonResult::Ok(ok),
        Err(error) => JsonResult::Error(error.to_string()),
    };

    dbg!(&result);

    Json(result)
}

#[launch]
fn rocket() -> _ {
    rocket::custom(rocket::Config::figment().merge(("port", 8000)))
        .mount("/", routes![get_subtrees_endpoint, move_block_endpoint])
}

#[cfg(test)]
mod tests {
    use super::*;
    use rocket::{local::blocking::Client, uri};

    use code_blocks_server::{BlockLocation, SupportedLanguage};

    macro_rules! post_request {
        ($endpoint:ident, $body:expr, $response_ty:ty) => {
            Client::tracked(rocket::build().mount("/", routes![$endpoint]))
                .expect("valid rocket instance")
                .post(uri!($endpoint))
                .json(&$body)
                .dispatch()
                .into_json::<$response_ty>()
        };
    }

    #[test]
    fn show_get_subtrees_request() {
        Client::tracked(rocket::build().mount("/", routes![get_subtrees_endpoint]))
            .expect("valid rocket instance")
            .post(uri!(get_subtrees_endpoint))
            .json(&GetSubtreesArgs {
                queries: vec!["(function_item) @ident".to_string()],
                text: "fn main() {}\nfn foo() {}".to_string(),
                language: SupportedLanguage::Rust,
            })
            .dispatch()
            .into_string();

        insta::assert_json_snapshot!(
            GetSubtreesArgs {
                queries: vec!["(function_item) @ident".to_string()],
                text: "fn main() {}\nfn foo() {}".to_string(),
                language: SupportedLanguage::Rust,
            },
            @r###"
        {
          "queries": [
            "(function_item) @ident"
          ],
          "text": "fn main() {}\nfn foo() {}",
          "language": "rust"
        }
        "###
        );
    }

    #[test]
    fn show_get_subtrees_response() {
        insta::assert_json_snapshot!(
            post_request!(
                get_subtrees_endpoint,
                GetSubtreesArgs {
                    queries: vec!["(function_item) @ident".to_string()],
                    text: "fn main() {}\nfn foo() {}".to_string(),
                    language: SupportedLanguage::Rust,
                },
                JsonResult<GetSubtreesResponse>
            ),
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

        insta::assert_json_snapshot!(
            post_request!(
                get_subtrees_endpoint,
                GetSubtreesArgs {
                    queries: vec!["bad query".to_string()],
                    text: "fn main() {}\nfn foo() {}".to_string(),
                    language: SupportedLanguage::Rust,
                },
                JsonResult<GetSubtreesResponse>
            ),
            @r###"
        {
          "status": "error",
          "result": "Query error at 1:1. Invalid syntax:\nbad query\n^"
        }
        "###
        );

        insta::assert_json_snapshot!(
            post_request!(
                get_subtrees_endpoint,
                GetSubtreesArgs {
                    queries: vec!["(function_item) @ident".to_string()],
                    text: "bad text".to_string(),
                    language: SupportedLanguage::Rust,
                },
                JsonResult<GetSubtreesResponse>
            ),
            @r###"
        {
          "status": "ok",
          "result": []
        }
        "###
        );
    }

    #[test]
    fn show_move_block_request() {
        insta::assert_json_snapshot!(
            MoveBlockArgs {
                queries: vec!["(function_item) @ident".to_string()],
                text: "fn main() {}\nfn foo() {}".to_string(),
                language: SupportedLanguage::Rust,
                src_block: BlockLocation::default(),
                dst_block: BlockLocation::default(),
            },
            @r###"
        {
          "queries": [
            "(function_item) @ident"
          ],
          "text": "fn main() {}\nfn foo() {}",
          "language": "rust",
          "srcBlock": {
            "startByte": 0,
            "endByte": 0,
            "startRow": 0,
            "startCol": 0,
            "endRow": 0,
            "endCol": 0
          },
          "dstBlock": {
            "startByte": 0,
            "endByte": 0,
            "startRow": 0,
            "startCol": 0,
            "endRow": 0,
            "endCol": 0
          }
        }
        "###
        );
    }

    #[test]
    fn show_move_block_response() {
        insta::assert_json_snapshot!(
            post_request!(
                move_block_endpoint,
                MoveBlockArgs {
                    queries: vec!["(function_item) @ident".to_string()],
                    text: "fn main() {}\nfn foo() {}".to_string(),
                    language: SupportedLanguage::Rust,
                    src_block: BlockLocation {
                        start_byte: 0,
                        end_byte: 12,
                        start_row: 0,
                        start_col: 0,
                        end_row: 0,
                        end_col: 12
                    },
                    dst_block: BlockLocation {
                        start_byte: 13,
                        end_byte: 24,
                        start_row: 1,
                        start_col: 0,
                        end_row: 1,
                        end_col: 11
                    },
                },
                JsonResult<MoveBlockResponse>
            ),
            @r###"
        {
          "status": "ok",
          "result": "fn foo() {}\nfn main() {}"
        }
        "###
        );

        insta::assert_json_snapshot!(
            post_request!(
                move_block_endpoint,
                MoveBlockArgs {
                    queries: vec!["bad query".to_string()],
                    text: "fn main() {}\nfn foo() {}".to_string(),
                    language: SupportedLanguage::Rust,
                    src_block: BlockLocation {
                        start_byte: 0,
                        end_byte: 12,
                        start_row: 0,
                        start_col: 0,
                        end_row: 0,
                        end_col: 12
                    },
                    dst_block: BlockLocation {
                        start_byte: 13,
                        end_byte: 24,
                        start_row: 1,
                        start_col: 0,
                        end_row: 1,
                        end_col: 11
                    },
                },
                JsonResult<MoveBlockResponse>
            ),
            @r###"
        {
          "status": "error",
          "result": "Query error at 1:1. Invalid syntax:\nbad query\n^"
        }
        "###
        );

        insta::assert_json_snapshot!(
            post_request!(
                move_block_endpoint,
                MoveBlockArgs {
                    queries: vec!["(function_item) @ident".to_string()],
                    text: "bad text".to_string(),
                    language: SupportedLanguage::Rust,
                    src_block: BlockLocation {
                        start_byte: 0,
                        end_byte: 12,
                        start_row: 0,
                        start_col: 0,
                        end_row: 0,
                        end_col: 12
                    },
                    dst_block: BlockLocation {
                        start_byte: 13,
                        end_byte: 24,
                        start_row: 1,
                        start_col: 0,
                        end_row: 1,
                        end_col: 11
                    },
                },
                JsonResult<MoveBlockResponse>
            ),
            @r###"
        {
          "status": "error",
          "result": "Failed to find src item"
        }
        "###
        );

        insta::assert_json_snapshot!(
            post_request!(
                move_block_endpoint,
                MoveBlockArgs {
                    queries: vec!["(function_item) @ident".to_string()],
                    text: "bad text".to_string(),
                    language: SupportedLanguage::Rust,
                    src_block: BlockLocation {
                        start_byte: 99999999,
                        end_byte: 12,
                        start_row: 0,
                        start_col: 0,
                        end_row: 0,
                        end_col: 12
                    },
                    dst_block: BlockLocation {
                        start_byte: 13,
                        end_byte: 24,
                        start_row: 1,
                        start_col: 0,
                        end_row: 1,
                        end_col: 11
                    },
                },
                JsonResult<MoveBlockResponse>
            ),
            @r###"
        {
          "status": "error",
          "result": "Failed to find src item"
        }
        "###
        );

        insta::assert_json_snapshot!(
            post_request!(
                move_block_endpoint,
                MoveBlockArgs {
                    queries: vec!["(function_item) @ident".to_string()],
                    text: "fn main() {}\nfn foo() {}".to_string(),
                    language: SupportedLanguage::Rust,
                    src_block: BlockLocation {
                        start_byte: 0,
                        end_byte: 12,
                        start_row: 0,
                        start_col: 0,
                        end_row: 0,
                        end_col: 12
                    },
                    dst_block: BlockLocation {
                        start_byte: 99999999,
                        end_byte: 24,
                        start_row: 1,
                        start_col: 0,
                        end_row: 1,
                        end_col: 11
                    },
                },
                JsonResult<MoveBlockResponse>
            ),
            @r###"
        {
          "status": "error",
          "result": "Failed to find dst item"
        }
        "###
        );
    }
}

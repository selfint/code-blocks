use code_blocks::{Block, BlockTree};

use tree_sitter::{Language, Parser, Point, Tree};

pub fn build_tree(text: &str, language: Language) -> Tree {
    let mut parser = Parser::new();
    parser
        .set_language(language)
        .expect("failed to set language");
    parser.parse(text, None).expect("failed to parse text")
}

#[allow(dead_code)]
pub fn copy_item_above<'tree>(
    ident: &str,
    text: &str,
    trees: &Vec<BlockTree<'tree>>,
) -> Option<Block<'tree>> {
    let pos = text
        .lines()
        .enumerate()
        .find_map(|(row, line)| line.find(ident).map(|col| Point::new(row - 1, col)))?;

    for tree in trees {
        if tree.block.tail().start_position() == pos {
            return Some(tree.block.clone());
        }

        if let Some(node) = copy_item_above(ident, text, &tree.children) {
            return Some(node);
        }
    }

    None
}

#[macro_export]
macro_rules! snapshot {
    ($name:tt, $lang:expr, $queries:expr, $input:literal) => {
        #[test]
        fn $name() {
            let text = $input;
            let queries = $queries;

            let force = false;
            fn check_fn(_a: &Block, _b: &Block) -> Result<()> {
                Ok(())
            }

            let tree = build_tree(text, $lang);

            let items = code_blocks::get_query_subtrees(&queries, &tree, text);
            let src_block = copy_item_above("^src", text, &items).expect("failed to find src item");
            let dst_item = copy_item_above("^dst", text, &items);
            let fail_item = copy_item_above("^fail", text, &items);

            let snapshot = if let Some(dst_item) = dst_item {
                let (new_text, mut new_src_start, mut new_dst_start) =
                    code_blocks::move_block(src_block, dst_item, text, Some(check_fn), force)
                        .expect("move block failed");

                let mut new_lines = vec![];
                let mut added_src = false;
                let mut added_dst = false;
                for line in new_text.lines() {
                    new_lines.push(line.to_string());
                    if new_src_start > line.len() {
                        new_src_start -= line.len() + 1;
                    } else if !added_src {
                        new_lines.push(" ".repeat(new_src_start) + "^ Source");
                        added_src = true;
                    }

                    if new_dst_start > line.len() {
                        new_dst_start -= line.len() + 1;
                    } else if !added_dst {
                        new_lines.push(" ".repeat(new_dst_start) + "^ Dest");
                        added_dst = true;
                    }
                }

                let new_text = new_lines.join("\n");
                format!("input:\n{}\n---\noutput:\n{}", text, new_text)
            } else if let Some(fail_item) = fail_item {
                let err =
                    code_blocks::move_block(src_block, fail_item, text, Some(check_fn), force)
                        .err()
                        .expect("move block succeeded, but should've failed");
                format!("input:\n{}\n---\noutput:\n{:?}", text, err)
            } else {
                unreachable!("no dst/fail item in input");
            };

            insta::assert_display_snapshot!(snapshot);
        }
    };

    ($name:tt, $lang:expr, $queries:expr, $check_fn:ident, $input:literal) => {
        #[test]
        fn $name() {
            let text = $input;
            let queries = $queries;

            let force = false;

            let tree = build_tree(text, $lang);

            let items = code_blocks::get_query_subtrees(&queries, &tree, text);
            let src_block = copy_item_above("^src", text, &items).expect("failed to find src item");
            let dst_item = copy_item_above("^dst", text, &items);
            let fail_item = copy_item_above("^fail", text, &items);

            let snapshot = if let Some(dst_item) = dst_item {
                let (new_text, mut new_src_start, mut new_dst_start) =
                    code_blocks::move_block(src_block, dst_item, text, Some($check_fn), force)
                        .expect("move block failed");

                let mut new_lines = vec![];
                let mut added_src = false;
                let mut added_dst = false;
                for line in new_text.lines() {
                    new_lines.push(line.to_string());
                    if new_src_start > line.len() {
                        new_src_start -= line.len() + 1;
                    } else if !added_src {
                        new_lines.push(" ".repeat(new_src_start) + "^ Source");
                        added_src = true;
                    }

                    if new_dst_start > line.len() {
                        new_dst_start -= line.len() + 1;
                    } else if !added_dst {
                        new_lines.push(" ".repeat(new_dst_start) + "^ Dest");
                        added_dst = true;
                    }
                }

                let new_text = new_lines.join("\n");
                format!("input:\n{}\n---\noutput:\n{}", text, new_text)
            } else if let Some(fail_item) = fail_item {
                let err =
                    code_blocks::move_block(src_block, fail_item, text, Some($check_fn), force)
                        .err()
                        .expect("move block succeeded, but should've failed");
                format!("input:\n{}\n---\noutput:\n{:?}", text, err)
            } else {
                unreachable!("no dst/fail item in input");
            };

            insta::assert_display_snapshot!(snapshot);
        }
    };
}

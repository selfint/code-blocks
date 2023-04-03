use anyhow::{ensure, Result};
use code_blocks::{Block, BlockTree};

use tree_sitter::{Parser, Point, Query, Tree};

fn build_tree(text: &str) -> Tree {
    let mut parser = Parser::new();
    parser.set_language(tree_sitter_rust::language()).unwrap();
    parser.parse(text, None).unwrap()
}

// macro_rules! snapshot {
//     ($name:tt, check: $check_fn:expr, force: $force:literal, $text:literal) => {
//         let tree = build_tree($text);

//         let items = code_blocks::get_query_subtrees(&rust_queries(), &tree, $text);
//         let src_block = copy_item_above("^src", $text, &items).unwrap();
//         let dst_item = copy_item_above("^dst", $text, &items);
//         let fail_item = copy_item_above("^fail", $text, &items);

//         let snapshot = if let Some(dst_item) = dst_item {
//             let (new_text, new_src_start, new_dst_start) =
//                 code_blocks::move_block(src_block, dst_item, $text, $check_fn, $force).unwrap();

//             format!(
//                 "{}\n\nNew src start: {}\nNew dst start: {}",
//                 new_text, new_src_start, new_dst_start
//             )
//         } else if let Some(fail_item) = fail_item {
//             let result = code_blocks::move_block(src_block, fail_item, $text, $check_fn, $force);
//             assert!(result.is_err());
//             format!("{}\n\n{:?}", $text, result.err().unwrap())
//         } else {
//             panic!("no dst/fail item in input");
//         };

//         insta::assert_display_snapshot!(snapshot);
//     };
// }

fn copy_item_above<'tree>(
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

fn rust_queries() -> [Query; 4] {
    [
        Query::new(
            tree_sitter_rust::language(),
            "(([(attribute_item) (line_comment)] @header . [(attribute_item) (line_comment)]* @header)? . (function_item) @item)",
        )
        .unwrap(),
        Query::new(
            tree_sitter_rust::language(),
            "(([(attribute_item) (line_comment)] @header . [(attribute_item) (line_comment)]* @header)? . (mod_item) @item)",
        )
        .unwrap(),
        Query::new(
            tree_sitter_rust::language(),
            "(([(attribute_item) (line_comment)] @header . [(attribute_item) (line_comment)]* @header)? . (struct_item) @item)",
        )
        .unwrap(),
        Query::new(
            tree_sitter_rust::language(),
            "(([(attribute_item) (line_comment)] @header . [(attribute_item) (line_comment)]* @header)? . (impl_item) @item)",
        )
        .unwrap(),
    ]
}

macro_rules! snapshot {
    ($name:tt, $input:literal) => {
        #[test]
        fn $name() {
            let text = $input;
            let queries = rust_queries();
            fn check_fn(_a: &Block, _b: &Block) -> Result<()> {
                Ok(())
            }

            let force = false;

            let tree = build_tree(text);

            let items = code_blocks::get_query_subtrees(&queries, &tree, text);
            let src_block = copy_item_above("^src", text, &items).unwrap();
            let dst_item = copy_item_above("^dst", text, &items);
            let fail_item = copy_item_above("^fail", text, &items);

            let snapshot = if let Some(dst_item) = dst_item {
                let (new_text, mut new_src_start, mut new_dst_start) =
                    code_blocks::move_block(src_block, dst_item, text, Some(check_fn), force)
                        .unwrap();

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
                        .unwrap();
                format!("input:\n{}\n---\noutput:\n{:?}", text, err)
            } else {
                panic!("no dst/fail item in input");
            };

            insta::assert_display_snapshot!(snapshot);
        }
    };
}

snapshot! {
    test_move_down,
r#"
    fn foo() {
 /* ^src */
        fn in_foo() {
            bar();
        }
    }

    fn bar() {}
 /* ^dst */
"#
}

snapshot! {
    test_move_up,
r#"
    fn foo() {
        fn baz() {}
     /* ^dst */

        fn spam() {}

        fn in_foo() {
     /* ^src */
            bar();
        }
    }

    fn bar() {}
"#
}

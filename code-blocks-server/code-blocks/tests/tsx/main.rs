use anyhow::{bail, Result};
use code_blocks::{get_query_subtrees, Block, BlockTree};

use tree_sitter::{Parser, Point, Query, Tree};

fn build_tree(text: &str) -> Tree {
    let mut parser = Parser::new();
    parser
        .set_language(tree_sitter_typescript::language_tsx())
        .unwrap();
    parser.parse(text, None).unwrap()
}

const TSX_QUERY_STRINGS: [&str; 6] = [
    "( (comment)* @header . (class_declaration) @item)",
    "( (comment)* @header . (method_definition) @item)",
    "( (comment)* @header . (function_declaration) @item)",
    "( (comment)* @header . (export_statement) @item)",
    "(jsx_element) @item",
    "(jsx_self_closing_element) @item",
];

fn tsx_queries() -> [Query; 6] {
    TSX_QUERY_STRINGS.map(|q| Query::new(tree_sitter_typescript::language_tsx(), q).unwrap())
}

#[test]
fn test_get_query_subtrees() {
    let text = r#"
    export default function App() {
      return (
          <div>
            <button className="card" onClick={readFile}>
              Choose file
            </button>
            <button className="card" onClick={() => writeFile(filePath, content)}>
              Write file
            </button>
          </div>
      );
    }
"#;

    let tree = build_tree(text);
    let subtrees = get_query_subtrees(&tsx_queries(), &tree, text);

    fn get_tree_blocks(subtree: &BlockTree, blocks: &mut Vec<String>, text: &str) {
        blocks.push(text[subtree.block.byte_range()].to_string());
        for child in &subtree.children {
            get_tree_blocks(child, blocks, text);
        }
    }

    let mut blocks = vec![];
    for t in &subtrees {
        get_tree_blocks(t, &mut blocks, text);
    }

    insta::assert_yaml_snapshot!(blocks);
}

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

macro_rules! check {
    (check: $check_fn:expr, force: $force:literal, $text:literal) => {
        let tree = build_tree($text);

        let items = get_query_subtrees(&tsx_queries(), &tree, $text);
        let src_block = copy_item_above("^src", $text, &items).unwrap();
        let dst_item = copy_item_above("^dst", $text, &items);
        let fail_item = copy_item_above("^fail", $text, &items);

        if let Some(dst_item) = dst_item {
            insta::assert_display_snapshot!(code_blocks::move_block(
                src_block, dst_item, $text, $check_fn, $force
            )
            .unwrap());
        } else if let Some(fail_item) = fail_item {
            let result = code_blocks::move_block(src_block, fail_item, $text, $check_fn, $force);
            assert!(result.is_err());

            insta::assert_display_snapshot!(format!("{}\n\n{:?}", $text, result.err().unwrap()));
        }
    };
}

fn check_fn(s: &Block, d: &Block) -> Result<()> {
    if s.head().parent() != d.head().parent() {
        bail!("Blocks have different parents");
    }

    Ok(())
}

#[test]
fn test_move_block() {
    check!(
        check: Some(check_fn),
        force: false,
        r#"
    export default function App() {
        return (
            <>
              <button>
          {/* ^src */}
                Choose file
              </button>!!! stuff in here is also part of the syntax tree !!!
              <button>
          {/* ^dst */}
                Write file
              </button>!!! stuff in here is also part of the syntax tree !!!
            </>
          );
    }
"#
    );
}

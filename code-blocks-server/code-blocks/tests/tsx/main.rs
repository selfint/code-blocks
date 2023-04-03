use anyhow::{ensure, Result};
use tree_sitter::Query;

use code_blocks::{get_query_subtrees, Block, BlockTree};

#[path = "../test_utils.rs"]
mod test_utils;
use test_utils::{build_tree, copy_item_above};

const TSX_QUERY_STRINGS: [&str; 6] = [
    "( (comment)* @header . (class_declaration) @item)",
    "( (comment)* @header . (method_definition) @item)",
    "( (comment)* @header . (function_declaration) @item)",
    "( (comment)* @header . (export_statement) @item)",
    "(jsx_element) @item",
    "(jsx_self_closing_element) @item",
];

fn tsx_queries() -> [Query; 6] {
    TSX_QUERY_STRINGS
        .map(|q| Query::new(tree_sitter_typescript::language_tsx(), q).expect("invalid query"))
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

    let tree = build_tree(text, tree_sitter_typescript::language_tsx());
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

fn preserve_scope(s: &Block, d: &Block) -> Result<()> {
    ensure!(
        s.head().parent() == d.head().parent(),
        "Blocks have different parents"
    );

    Ok(())
}

snapshot!(
    test_move_block,
    tree_sitter_typescript::language_tsx(),
    tsx_queries(),
    preserve_scope,
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

snapshot!(
    test_move_block_outside_scope,
    tree_sitter_typescript::language_tsx(),
    tsx_queries(),
    r#"
    export default function App() {
        return (
            <>
              <div>
                <button>
            {/* ^src */}
                  Choose file
                </button>!!! stuff in here is also part of the syntax tree !!!
              </div>
              <button>
          {/* ^dst */}
                Write file
              </button>!!! stuff in here is also part of the syntax tree !!!
            </>
          );
    }
"#
);

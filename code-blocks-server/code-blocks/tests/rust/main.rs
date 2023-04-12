use anyhow::{ensure, Result};
use tree_sitter::Query;

use code_blocks::{get_query_subtrees, Block};

#[path = "../test_utils.rs"]
mod test_utils;
use test_utils::{build_tree, copy_item_above};

fn preserve_scope(s: &Block, d: &Block) -> Result<()> {
    ensure!(
        s.head().parent() == d.head().parent(),
        "Blocks have different parents"
    );

    Ok(())
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

#[test]
fn test_get_query_subtrees() {
    let text = r#"
mod stuff {
    #[derive(Debug)]
    /// struct doc
    struct A {

    }

    /// docs
    pub fn foo() { }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// test foo
    #[test]
    /// very long test
    #[ignore]
    fn test_foo() {
        stuff::foo();
    }
}
"#;
    let tree = build_tree(text, tree_sitter_rust::language());
    let subtrees = get_query_subtrees(&rust_queries(), &tree, text);

    for t in &subtrees {
        dbg!(text[t.block.byte_range()].to_string());
    }

    insta::assert_debug_snapshot!(subtrees);
}

snapshot! {
    test_move_block,
    tree_sitter_rust::language(),
    rust_queries(),
        r#"
    fn foo() { // src
        fn in_foo() {
            bar();
        }
    }

    fn bar() {} // dst
"#
}

snapshot!(
    test_move_block_in_module,
    tree_sitter_rust::language(),
    rust_queries(),
    r#"
mod m {
    fn foo() { // src
        fn in_foo() {
            bar();
        }
    }

    fn bar() {} // dst
}

fn baz() {}
"#
);

snapshot!(
    test_move_block_in_module2,
    tree_sitter_rust::language(),
    rust_queries(),
    r#"
mod m {
    fn foo() {} // src

    fn bar() {}} // dst

fn baz() {}
"#
);

snapshot!(
    test_move_block_outside_scope_fails,
    tree_sitter_rust::language(),
    rust_queries(),
    preserve_scope,
    r#"
    mod m {
        fn foo() {} // src
    }

    fn baz() {} // fail
"#
);

snapshot!(
    test_move_block_outside_scope_fails2,
    tree_sitter_rust::language(),
    rust_queries(),
    preserve_scope,
    r#"
    mod m { // fail
        fn foo() {} // src
    }

    fn baz() {}
"#
);

snapshot!(
    test_move_block_up,
    tree_sitter_rust::language(),
    rust_queries(),
    r#"
    fn foo() {} // dst

    fn bar() {}

    fn baz() {} // src
"#
);

snapshot!(
    test_move_block_down,
    tree_sitter_rust::language(),
    rust_queries(),
    r#"
    mod m1 { // src
        fn foo() {}
    }

    mod m2 {
        fn bar() {}
    }

    mod m3 { // dst
        fn baz() {}
    }
"#
);

snapshot!(
    test_move_block_up2,
    tree_sitter_rust::language(),
    rust_queries(),
    r#"
    mod m1 { // dst
        fn foo() {}
    }

    mod m2 {
        fn bar() {}
    }

    mod m3 { // src
        fn baz() {}
    }
"#
);

snapshot!(
    test_move_block_into_scope_fails,
    tree_sitter_rust::language(),
    rust_queries(),
    preserve_scope,
    r#"
    mod m1 {
        fn foo() {}
    }

    mod m2 {
        fn bar() {} // fail
    }

    mod m3 { // src
        fn baz() {}
    }
"#
);

snapshot!(
    test_move_block_with_attributes,
    tree_sitter_rust::language(),
    rust_queries(),
    r#"
    #[test]
    fn foo() {} // src

    fn bar() {} // dst
"#
);

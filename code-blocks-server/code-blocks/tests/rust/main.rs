use code_blocks::{get_query_subtrees, Block, BlockTree};

use tree_sitter::{Parser, Point, Query, Tree};

fn build_tree(text: &str) -> Tree {
    let mut parser = Parser::new();
    parser.set_language(tree_sitter_rust::language()).unwrap();
    parser.parse(text, None).unwrap()
}

fn rust_queries() -> [Query; 4] {
    [
        Query::new(
            tree_sitter_rust::language(),
            r#"
        (
            (
                [
                    (attribute_item)
                    (line_comment)
                ] @header
                .
                [
                    (attribute_item)
                    (line_comment)
                ]* @header
            )?
            .
            (function_item) @item
        )
        "#,
        )
        .unwrap(),
        Query::new(
            tree_sitter_rust::language(),
            r#"
        (
            (
                [
                    (attribute_item)
                    (line_comment)
                ] @header
                .
                [
                    (attribute_item)
                    (line_comment)
                ]* @header
            )?
            .
            (mod_item) @item
        )
        "#,
        )
        .unwrap(),
        Query::new(
            tree_sitter_rust::language(),
            r#"
        (
            (
                [
                    (attribute_item)
                    (line_comment)
                ] @header
                .
                [
                    (attribute_item)
                    (line_comment)
                ]* @header
            )?
            .
            (struct_item) @item
        )
        "#,
        )
        .unwrap(),
        Query::new(tree_sitter_rust::language(), r#"(impl_item) @item"#).unwrap(),
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
    let tree = build_tree(text);
    let subtrees = get_query_subtrees(&rust_queries(), &tree, text);

    for t in &subtrees {
        dbg!(text[t.block.byte_range().unwrap()].to_string());
    }

    insta::assert_debug_snapshot!(subtrees);
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
        if tree.block.tail().unwrap().start_position() == pos {
            return Some(tree.block.clone());
        }

        if let Some(node) = copy_item_above(ident, text, &tree.children) {
            return Some(node);
        }
    }

    None
}

macro_rules! check {
    ($text:literal) => {
        let tree = build_tree($text);

        let items = get_query_subtrees(&rust_queries(), &tree, $text);
        let src_item = copy_item_above("^src", $text, &items).unwrap();
        let dst_item = copy_item_above("^dst", $text, &items);
        let fail_item = copy_item_above("^fail", $text, &items);

        if let Some(dst_item) = dst_item {
            insta::assert_display_snapshot!(
                code_blocks::move_block(src_item, dst_item, $text).unwrap()
            );
        } else if let Some(fail_item) = fail_item {
            let result = code_blocks::move_block(src_item, fail_item, $text);
            assert!(result.is_err());

            insta::assert_display_snapshot!(format!("{}\n\n{}", $text, result.err().unwrap()));
        }
    };
}

#[test]
fn test_move_block() {
    check!(
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
    );

    check!(
        r#"
mod m {
    fn foo() {
 /* ^src */
        fn in_foo() {
            bar();
        }
    }

    fn bar() {}
 /* ^dst */
}

fn baz() {}
"#
    );

    check!(
        r#"
mod m {
    fn foo() {}
 /* ^src */

    fn bar() {}}
 /* ^dst */

fn baz() {}
"#
    );

    check!(
        r#"
    mod m {
        fn foo() {}
     /* ^src */
    }

    fn baz() {}
/*  ^fail */
"#
    );

    check!(
        r#"
    mod m {
/*  ^fail */
        fn foo() {}
     /* ^src */
    }

    fn baz() {}
"#
    );

    check!(
        r#"
    fn foo() {}
 /* ^dst */

    fn bar() {}

    fn baz() {}
 /* ^src */
"#
    );

    check!(
        r#"
    mod m1 {
/*  ^src */
        fn foo() {}
    }

    mod m2 {
        fn bar() {}
    }

    mod m3 {
/*  ^dst */
        fn baz() {}
    }
"#
    );

    check!(
        r#"
    mod m1 {
/*  ^dst */
        fn foo() {}
    }

    mod m2 {
        fn bar() {}
    }

    mod m3 {
/*  ^src */
        fn baz() {}
    }
"#
    );

    check!(
        r#"
    mod m1 {
        fn foo() {}
    }

    mod m2 {
        fn bar() {}
    /*  ^fail */
    }

    mod m3 {
/*  ^src */
        fn baz() {}
    }
"#
    );

    check!(
        r#"
    #[test]
    fn foo() {}
/*  ^src */

    fn bar() {}
/*  ^dst */
"#
    );
}

use code_blocks::get_query_subtrees;
use code_blocks::Block;
use code_blocks::BlockTree;
use code_blocks_server::get_subtrees;
use code_blocks_server::GetSubtreesArgs;
use code_blocks_server::MoveBlockArgs;
use code_blocks_server::SupportedLanguage;
use tree_sitter::Parser;
use tree_sitter::Point;
use tree_sitter::Query;

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

fn get_query_strings(lang: SupportedLanguage) -> Vec<String> {
    match lang {
        SupportedLanguage::Rust => vec![
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
        "#
            .to_string(),
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
        "#
            .to_string(),
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
        "#
            .to_string(),
            r#"(impl_item) @item"#.to_string(),
        ],
        SupportedLanguage::TypeScript => vec![
            r#"
(
    (comment)* @header
    .
    (class_declaration) @item
)
            "#
            .to_string(),
            r#"
(
    (comment)* @header
    .
    (method_definition) @item
)
            "#
            .to_string(),
            r#"
(
    (comment)* @header
    .
    (function_declaration) @item
)
            "#
            .to_string(),
            r#"
(
    (comment)* @header
    .
    (export_statement) @item
)
            "#
            .to_string(),
        ],
        SupportedLanguage::TSX => get_query_strings(SupportedLanguage::TypeScript),
        SupportedLanguage::Svelte => todo!(),
    }
}

fn get_queries(lang: SupportedLanguage) -> Vec<Query> {
    get_query_strings(lang)
        .iter()
        .map(|source| Query::new(lang.get_language(), source).unwrap())
        .collect()
}

#[test]
fn test_get_subtrees() {
    insta::assert_debug_snapshot!(get_subtrees(GetSubtreesArgs {
        queries: get_query_strings(SupportedLanguage::Rust),
        language: SupportedLanguage::Rust,
        text: r#"
mod m {
    fn foo() {}
    fn baz() {}
}

#[cfg(test)]
mod m {
    /// comment 1
    #[test]
    fn foo() {}

    #[test]
    #[ignore]
    /// comment 2
    fn baz() {}
}
            "#
        .to_string()
    }));

    insta::assert_debug_snapshot!(code_blocks_server::get_subtrees(GetSubtreesArgs {
        queries: get_query_strings(SupportedLanguage::TypeScript),
        language: SupportedLanguage::TypeScript,
        text: r#"
class TsClass {
    constructor() {}

    foo() {}

    /**
    * bar docs
    */
    bar() {}
}

export function baz() {}

export default function baz2() {}
            "#
        .to_string()
    }));
}

macro_rules! check {
    ($lang:expr, $text:literal) => {
        let mut parser = Parser::new();
        parser.set_language($lang.get_language()).unwrap();
        let tree = parser.parse($text, None).unwrap();

        let items = get_query_subtrees(&get_queries($lang), &tree, $text);
        let src_block = copy_item_above("^src", $text, &items).unwrap();
        let dst_block = copy_item_above("^dst", $text, &items);
        let fail_block = copy_item_above("^fail", $text, &items);

        if let Some(dst_block) = dst_block {
            insta::assert_display_snapshot!(code_blocks_server::move_block(MoveBlockArgs {
                queries: get_query_strings($lang),
                text: $text.to_string(),
                language: $lang,
                src_block: src_block.into(),
                dst_block: dst_block.into(),
            })
            .unwrap());
        } else if let Some(fail_block) = fail_block {
            insta::assert_display_snapshot!(code_blocks_server::move_block(MoveBlockArgs {
                queries: get_query_strings($lang),
                text: $text.to_string(),
                language: $lang,
                src_block: src_block.into(),
                dst_block: fail_block.into(),
            },)
            .err()
            .unwrap());
        }
    };
}

#[test]
fn test_move_item_rs() {
    check!(
        SupportedLanguage::Rust,
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
        SupportedLanguage::Rust,
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
        SupportedLanguage::Rust,
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
        SupportedLanguage::Rust,
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
        SupportedLanguage::Rust,
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
        SupportedLanguage::Rust,
        r#"
    fn foo() {}
 /* ^dst */

    fn bar() {}

    fn baz() {}
 /* ^src */
"#
    );

    check!(
        SupportedLanguage::Rust,
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
        SupportedLanguage::Rust,
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
        SupportedLanguage::Rust,
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
        SupportedLanguage::Rust,
        r#"
    mod m1 {
/*  ^dst */
        fn foo() {}
    }

    mod m2 {
        fn bar() {}
    }

    #[cfg(test)]
    #[test]
    /// a test module
    #[ignore]
    mod m3 {
/*  ^src */
        fn baz() {}
    }
"#
    );
}

#[test]
fn test_move_item_ts() {
    check!(
        SupportedLanguage::TypeScript,
        r#"
class TsClass {
    constructor() {}

    foo() {}
/*  ^src */

    /**
    * bar docs
    */
    bar() {}
/*  ^dst */
}

function baz() {}
    "#
    );

    check!(
        SupportedLanguage::TypeScript,
        r#"
class TsClass {
    constructor() {}

    /**
    * bar docs
    */
    foo() {}
/*  ^src */

    bar() {}
/*  ^dst */

    baz() {}
}

function baz() {}
    "#
    );

    check!(
        SupportedLanguage::TypeScript,
        r#"
    class TsClass {
        constructor() {}

        /**
        * bar docs
        */
        foo() {}
    /*  ^src */

        bar() {}

        baz() {}
    }

    function baz() {}
/*  ^fail */
    "#
    );

    check!(
        SupportedLanguage::TypeScript,
        r#"
    /**
    * class docs
    */
    class TsClass {
/*  ^src */
        constructor() {}

        foo() {}

        bar() {}

        baz() {}
    }

    function baz() {}
/*  ^dst */
    "#
    );

    check!(
        SupportedLanguage::TypeScript,
        r#"
    /**
    * class docs
    */
    class TsClass {
/*  ^src */
        constructor() {}

        foo() {}

        bar() {}

        baz() {}
    }

    class TsClass2 {
/*  ^dst */
        constructor() {}

        foo() {}
    }
    "#
    );
}

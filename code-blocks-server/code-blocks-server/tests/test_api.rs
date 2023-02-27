use code_blocks::get_query_subtrees;
use code_blocks::Block;
use code_blocks::BlockTree;
use code_blocks_server::get_subtrees;
use code_blocks_server::GetSubtreesArgs;
use code_blocks_server::LanguageProvider;
use code_blocks_server::MoveBlockArgs;
use code_blocks_server::SupportedDynamicLanguage;
use code_blocks_server::SupportedLanguage;
use tree_sitter::Point;
use tree_sitter::Query;

fn copy_target_item<'tree>(
    ident: &str,
    text: &str,
    trees: &Vec<BlockTree<'tree>>,
    lang: &SupportedLanguage,
) -> Option<Block<'tree>> {
    let (prefixed_ident, row_offset, col_offset) = match lang {
        SupportedLanguage::Python => ("V".to_string() + ident, 1, -1),
        SupportedLanguage::SupportedDynamic {
            language,
            install_dir: _,
        } if matches!(language, SupportedDynamicLanguage::Python) => {
            ("V".to_string() + ident, 1, -1)
        }
        _ => ("^".to_string() + ident, -1, 0),
    };

    let pos = text.lines().enumerate().find_map(|(row, line)| {
        line.find(&prefixed_ident).map(|col| {
            Point::new(
                (row as i32 + row_offset) as usize,
                (col as i32 + col_offset) as usize,
            )
        })
    })?;

    for tree in trees {
        if tree.block.tail().unwrap().start_position() == pos {
            return Some(tree.block.clone());
        }
        if let Some(node) = copy_target_item(ident, text, &tree.children, lang) {
            return Some(node);
        }
    }

    None
}

fn get_query_strings(lang: &SupportedLanguage) -> Vec<String> {
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
        SupportedLanguage::TSX => get_query_strings(&SupportedLanguage::TypeScript),
        SupportedLanguage::Python => vec![
            "(class_definition) @item".to_string(),
            "(function_definition) @item".to_string(),
            "(decorated_definition) @item".to_string(),
        ],
        SupportedLanguage::SupportedDynamic {
            language,
            install_dir: _,
        } if matches!(language, SupportedDynamicLanguage::Rust) => {
            get_query_strings(&SupportedLanguage::Rust)
        }
        SupportedLanguage::SupportedDynamic {
            language,
            install_dir: _,
        } if matches!(language, SupportedDynamicLanguage::Python) => {
            get_query_strings(&SupportedLanguage::Python)
        }
        SupportedLanguage::SupportedDynamic {
            language,
            install_dir: _,
        } if matches!(language, SupportedDynamicLanguage::TypeScript) => {
            get_query_strings(&SupportedLanguage::TypeScript)
        }
        SupportedLanguage::Dynamic {
            download_cmd: _,
            symbol: _,
            name,
            install_dir: _,
        } if name == "tree_sitter_rust" => get_query_strings(&SupportedLanguage::Rust),
        _ => todo!(),
    }
}

fn get_queries(lang: &SupportedLanguage, provider: &LanguageProvider) -> Vec<Query> {
    get_query_strings(lang)
        .iter()
        .map(|source| provider.build_query(source).unwrap())
        .collect()
}

#[test]
fn test_get_subtrees() {
    insta::assert_debug_snapshot!(get_subtrees(GetSubtreesArgs {
        queries: get_query_strings(&SupportedLanguage::Rust),
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
        queries: get_query_strings(&SupportedLanguage::TypeScript),
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

    insta::assert_debug_snapshot!(code_blocks_server::get_subtrees(GetSubtreesArgs {
        queries: get_query_strings(&SupportedLanguage::Python),
        language: SupportedLanguage::Python,
        text: r#"
        @decor1
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            def __init__(self):
                pass
        
            #Vsrc
            @staticmethod()
            def foo():
                """method docstring"""
                
            #Vdst
            def bar():
                ...
                
        def func():
            ...
            "#
        .to_string()
    }));
}

macro_rules! check {
    ($lang:expr, $text:literal) => {
        let lang = $lang;
        let mut provider = lang.get_provider().unwrap();
        let tree = provider.parse($text, None).unwrap();

        let items = get_query_subtrees(&get_queries(&lang, &provider), &tree, $text);
        let src_block = copy_target_item("src", $text, &items, &lang)
            .unwrap_or_else(|| panic!("failed to find src block in: {}", $text));
        let dst_block = copy_target_item("dst", $text, &items, &lang);
        let fail_block = copy_target_item("fail", $text, &items, &lang);

        if let Some(dst_block) = dst_block {
            insta::assert_display_snapshot!(code_blocks_server::move_block(MoveBlockArgs {
                queries: get_query_strings(&lang),
                text: $text.to_string(),
                language: lang,
                src_block: src_block.into(),
                dst_block: dst_block.into(),
            })
            .unwrap());
        } else if let Some(fail_block) = fail_block {
            insta::assert_display_snapshot!(code_blocks_server::move_block(MoveBlockArgs {
                queries: get_query_strings(&lang),
                text: $text.to_string(),
                language: lang,
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

#[test]
fn test_move_item_python() {
    check!(
        SupportedLanguage::Python,
        r#"
        #Vsrc
        @decor1
        @decor2
        class A:
            ...
           
        #Vdst
        class C:
            """class docstring"""
        
            def __init__(self):
                pass
        
            @staticmethod()
            def foo():
                """method docstring"""
                
            def bar():
                ...
                
        def func():
            ...
"#
    );

    check!(
        SupportedLanguage::Python,
        r#"
        #Vsrc
        @decor1
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            #Vfail
            def __init__(self):
                pass
        
            @staticmethod()
            def foo():
                """method docstring"""
                
            def bar():
                ...
                
        def func():
            ...
"#
    );

    check!(
        SupportedLanguage::Python,
        r#"
        @decor1
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            #Vsrc
            def __init__(self):
                pass
        
            #Vdst
            @staticmethod()
            def foo():
                """method docstring"""
                
            def bar():
                ...
                
        def func():
            ...
"#
    );

    check!(
        SupportedLanguage::Python,
        r#"
        @decor1
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            def __init__(self):
                pass
        
            #Vsrc
            @staticmethod()
            def foo():
                """method docstring"""
                
            def bar():
                ...
                
        #Vfail
        def func():
            ...
"#
    );

    check!(
        SupportedLanguage::Python,
        r#"
        @decor1
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            def __init__(self):
                pass
        
            #Vsrc
            @staticmethod()
            def foo():
                """method docstring"""
                
            #Vdst
            def bar():
                ...
                
        def func():
            ...
"#
    );
}

#[test]
#[ignore = "slow test due to external download"]
fn test_move_item_dynamic() {
    check!(
        SupportedLanguage::Dynamic {
            download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-rust".to_string(),
            symbol: "language".to_string(),
            name: "tree_sitter_rust".to_string(),
            install_dir: tempfile::tempdir().unwrap().into_path()
        },
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
}

#[test]
#[ignore = "slow test due to external download"]
fn test_move_item_supported_dynamic() {
    check!(
        SupportedLanguage::SupportedDynamic {
            language: SupportedDynamicLanguage::Python,
            install_dir: tempfile::tempdir().unwrap().into_path()
        },
        r#"
        #Vsrc
        @decor1
        @decor2
        class A:
            ...
           
        #Vdst
        class C:
            """class docstring"""
        
            def __init__(self):
                pass
        
            @staticmethod()
            def foo():
                """method docstring"""
                
            def bar():
                ...
                
        def func():
            ...
"#
    );
}

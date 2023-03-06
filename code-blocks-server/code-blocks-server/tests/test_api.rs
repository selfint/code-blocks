use anyhow::ensure;
use anyhow::Result;
use code_blocks::get_query_subtrees;
use code_blocks::Block;
use code_blocks::BlockTree;
use code_blocks_server::get_subtrees;
use code_blocks_server::GetSubtreesArgs;
use code_blocks_server::MoveBlockArgs;
use tree_sitter::Language;
use tree_sitter::Parser;
use tree_sitter::Point;
use tree_sitter::Query;

enum TestLanguage {
    Rust,
    TypeScript,
    Python,
    Tsx,
}

impl TestLanguage {
    fn get_language(&self) -> Language {
        match self {
            TestLanguage::Rust => tree_sitter_rust::language(),
            TestLanguage::TypeScript => tree_sitter_typescript::language_typescript(),
            TestLanguage::Python => tree_sitter_python::language(),
            TestLanguage::Tsx => tree_sitter_typescript::language_tsx(),
        }
    }
}

fn copy_target_item<'tree>(
    ident: &str,
    text: &str,
    trees: &Vec<BlockTree<'tree>>,
    lang: &TestLanguage,
) -> Option<Block<'tree>> {
    let (prefixed_ident, row_offset, col_offset) = match lang {
        TestLanguage::Python => ("V".to_string() + ident, 1, -1),
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
        if tree.block.tail().start_position() == pos {
            return Some(tree.block.clone());
        }
        if let Some(node) = copy_target_item(ident, text, &tree.children, lang) {
            return Some(node);
        }
    }

    None
}

fn get_query_strings(lang: &TestLanguage) -> Vec<String> {
    match lang {
        TestLanguage::Rust => vec![
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
        TestLanguage::TypeScript => vec![
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
        TestLanguage::Python => vec![
            "(class_definition) @item".to_string(),
            "(function_definition) @item".to_string(),
            "(decorated_definition) @item".to_string(),
        ],
        TestLanguage::Tsx => vec![
            "( (comment)* @header . (class_declaration) @item)".to_string(),
            "( (comment)* @header . (method_definition) @item)".to_string(),
            "( (comment)* @header . (function_declaration) @item)".to_string(),
            "( (comment)* @header . (export_statement) @item)".to_string(),
            "(jsx_element) @item".to_string(),
            "(jsx_self_closing_element) @item".to_string(),
        ],
    }
}

fn get_queries(lang: &TestLanguage) -> Vec<Query> {
    let language = lang.get_language();
    get_query_strings(lang)
        .iter()
        .map(|source| Query::new(language, source).unwrap())
        .collect()
}

#[test]
fn test_get_subtrees() {
    insta::assert_debug_snapshot!(get_subtrees(GetSubtreesArgs {
        queries: get_query_strings(&TestLanguage::Rust),
        language: TestLanguage::Rust.get_language(),
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
        queries: get_query_strings(&TestLanguage::TypeScript),
        language: TestLanguage::TypeScript.get_language(),
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
        queries: get_query_strings(&TestLanguage::Python),
        language: TestLanguage::Python.get_language(),
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
    (language: $lang:expr, check with: $check_fn:expr, force: $force:literal, $text:literal) => {
        let lang = $lang;
        let mut parser = Parser::new();
        parser.set_language(lang.get_language()).unwrap();

        let tree = parser.parse($text, None).unwrap();

        let items = get_query_subtrees(&get_queries(&lang), &tree, $text);
        let src_block = copy_target_item("src", $text, &items, &lang)
            .unwrap_or_else(|| panic!("failed to find src block in: {}", $text));
        let dst_block = copy_target_item("dst", $text, &items, &lang);
        let fail_block = copy_target_item("fail", $text, &items, &lang);

        if let Some(dst_block) = dst_block {
            insta::assert_display_snapshot!(code_blocks_server::move_block(MoveBlockArgs {
                queries: get_query_strings(&lang),
                text: $text.to_string(),
                language: lang.get_language(),
                src_block: src_block.into(),
                dst_block: dst_block.into(),
                assert_move_legal_fn: $check_fn,
                force: $force,
            })
            .unwrap());
        } else if let Some(fail_block) = fail_block {
            insta::assert_debug_snapshot!(code_blocks_server::move_block(MoveBlockArgs {
                queries: get_query_strings(&lang),
                text: $text.to_string(),
                language: lang.get_language(),
                src_block: src_block.into(),
                dst_block: fail_block.into(),
                assert_move_legal_fn: $check_fn,
                force: $force,
            })
            .err()
            .unwrap());
        } else {
            unreachable!("No dst/fail block");
        }
    };
}

fn check_fn(s: &Block, d: &Block) -> Result<()> {
    ensure!(
        s.head().parent() == d.head().parent(),
        "Blocks have different parents"
    );

    Ok(())
}

#[test]
fn test_move_item_rs() {
    check!(
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
        r#"
    fn foo() {}
 /* ^dst */

    fn bar() {}

    fn baz() {}
 /* ^src */
"#
    );

    check!(
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Rust,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::TypeScript,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::TypeScript,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::TypeScript,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::TypeScript,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::TypeScript,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Python,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Python,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Python,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Python,
        check with: Some(check_fn),
        force: false,
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
        language: TestLanguage::Python,
        check with: Some(check_fn),
        force: false,
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
fn test_move_item_tsx() {
    check!(
        language: TestLanguage::Tsx,
        check with: Some(check_fn),
        force: false,
        r#"
    export default function App() {
      return (
          <div>
            <button className="card" onClick={readFile}>
        {/* ^src */}
              Choose file
            </button>
            <button className="card" onClick={() => writeFile(filePath, content)}>
        {/* ^dst */}
              Write file
            </button>
          </div>
      );
    }
    "#
    );

    check!(
        language: TestLanguage::Tsx,
        check with: Some(check_fn),
        force: false,
        r#"
    export default function App() {
      return (
          <div>
      {/* ^fail */}
            <button className="card" onClick={readFile}>
        {/* ^src */}
              Choose file
            </button>
            <button className="card" onClick={() => writeFile(filePath, content)}>
              Write file
            </button>
          </div>
      );
    }
    "#
    );
}

#[test]
fn test_move_item_force() {
    check!(
        language: TestLanguage::Tsx,
        check with: Some(check_fn),
        force: true,
        r#"
    export default function App() {
      return (
          <div>
      {/* ^dst */}
            <button className="card" onClick={readFile}>
        {/* ^src */}
              Choose file
            </button>
            <button className="card" onClick={() => writeFile(filePath, content)}>
              Write file
            </button>
          </div>
      );
    }
    "#
    );
}

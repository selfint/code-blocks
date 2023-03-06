use anyhow::{bail, Result};
use code_blocks::{get_query_subtrees, Block, BlockTree};

use tree_sitter::{Parser, Point, Query, Tree};

fn build_tree(text: &str) -> Tree {
    let mut parser = Parser::new();
    parser.set_language(tree_sitter_python::language()).unwrap();
    parser.parse(text, None).unwrap()
}

const PYTHON_QUERY_STRINGS: [&str; 3] = [
    "(class_definition) @item",
    "(function_definition) @item",
    "(decorated_definition) @item",
];

fn python_queries() -> [Query; 3] {
    PYTHON_QUERY_STRINGS.map(|q| Query::new(tree_sitter_python::language(), q).unwrap())
}

#[test]
fn test_get_query_subtrees() {
    let text = r#"
    @decor1
    @decor2
    class A:
        ...
       
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
        
    a = lambda: 5
    
"#;

    let tree = build_tree(text);
    let subtrees = get_query_subtrees(&python_queries(), &tree, text);

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

fn copy_item_below<'tree>(
    ident: &str,
    text: &str,
    trees: &Vec<BlockTree<'tree>>,
) -> Option<Block<'tree>> {
    let pos = text
        .lines()
        .enumerate()
        .find_map(|(row, line)| line.find(ident).map(|col| Point::new(row + 1, col - 1)))?;

    for tree in trees {
        if tree.block.tail().start_position() == pos {
            return Some(tree.block.clone());
        }

        if let Some(node) = copy_item_below(ident, text, &tree.children) {
            return Some(node);
        }
    }

    None
}

macro_rules! check {
    (check: $check_fn:expr, force: $force:literal, $text:literal) => {
        let tree = build_tree($text);

        let items = get_query_subtrees(&python_queries(), &tree, $text);
        let src_block = copy_item_below("Vsrc", $text, &items).unwrap();
        let dst_item = copy_item_below("Vdst", $text, &items);
        let fail_item = copy_item_below("Vfail", $text, &items);

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
        check: Some(check_fn),
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
        check: Some(check_fn),
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
        check: Some(check_fn),
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
        check: Some(check_fn),
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

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

fn tsx_queries() -> [Query; 3] {
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
    let subtrees = get_query_subtrees(&tsx_queries(), &tree, text);

    fn get_tree_blocks(subtree: &BlockTree, blocks: &mut Vec<String>, text: &str) {
        blocks.push(text[subtree.block.byte_range().unwrap()].to_string());
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
        if tree.block.tail().unwrap().start_position() == pos {
            return Some(tree.block.clone());
        }

        if let Some(node) = copy_item_below(ident, text, &tree.children) {
            return Some(node);
        }
    }

    None
}

macro_rules! check {
    ($text:literal) => {
        let tree = build_tree($text);

        let items = get_query_subtrees(&tsx_queries(), &tree, $text);
        let src_block = copy_item_below("Vsrc", $text, &items).unwrap();
        let dst_item = copy_item_below("Vdst", $text, &items);
        let fail_item = copy_item_below("Vfail", $text, &items);

        if let Some(dst_item) = dst_item {
            insta::assert_display_snapshot!(
                code_blocks::move_block(src_block, dst_item, $text).unwrap()
            );
        } else if let Some(fail_item) = fail_item {
            let result = code_blocks::move_block(src_block, fail_item, $text);
            assert!(result.is_err());

            insta::assert_display_snapshot!(format!("{}\n\n{}", $text, result.err().unwrap()));
        }
    };
}

#[test]
fn test_move_block() {
    check!(
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
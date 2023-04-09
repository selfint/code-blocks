use anyhow::{ensure, Result};
use code_blocks::{get_query_subtrees, Block, BlockTree};

use tree_sitter::Query;

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

    let tree = build_tree(text, tree_sitter_python::language());
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

snapshot!(
    test_move_class,
    tree_sitter_python::language(),
    python_queries(),
    r#"
        @decor1 # src
        @decor2
        class A:
            ...
           
        class C: # dst
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

snapshot!(
    test_move_preserve_scope,
    tree_sitter_python::language(),
    python_queries(),
    preserve_scope,
    r#"
        @decor1 # src
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            def __init__(self): # fail
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

snapshot!(
    test_move_method,
    tree_sitter_python::language(),
    python_queries(),
    r#"
        @decor1
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            def __init__(self): # src
                pass
        
            @staticmethod() # dst
            def foo():
                """method docstring"""
                
            def bar():
                ...
                
        def func():
            ...
"#
);

snapshot!(
    test_move_out_scope_fails,
    tree_sitter_python::language(),
    python_queries(),
    preserve_scope,
    r#"
        @decor1
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            def __init__(self):
                pass
        
            @staticmethod() # src
            def foo():
                """method docstring"""
                
            def bar():
                ...
                
        def func(): # fail
            ...
"#
);

snapshot!(
    test_move_decorated_method,
    tree_sitter_python::language(),
    python_queries(),
    r#"
        @decor1
        @decor2
        class A:
            ...
           
        class C:
            """class docstring"""
        
            def __init__(self):
                pass
        
            @staticmethod() # src
            def foo():
                """method docstring"""
                
            def bar(): # dst
                ...
                
        def func():
            ...
"#
);

snapshot!(
    test_move_outside_class_force,
    tree_sitter_python::language(),
    python_queries(),
    r#"
        from dataclasses import dataclass

        @dataclass
        class A: # dst
            def __init__(self) -> None:
                ...
        
            def foo(self) -> None: # src
                ...
        
        
        def main():
            ...
        
        
        if __name__ == "__main__":
            main()
"#
);

snapshot!(
    test_move_nested_methods,
    tree_sitter_python::language(),
    python_queries(),
    r#"
from dataclasses import dataclass

@dataclass
class A:
    def __init__(self) -> None:
        pass

    def bar(self) -> None: # dst
        pass


        def foo(self) -> None: # src
            pass


def main():
    pass

if __name__ == "__main__":
    main()
    "#
);

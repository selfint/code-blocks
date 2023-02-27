use libloading::Library;

use anyhow::Result;
use tree_sitter::{Language, Parser, Tree};

/// A [tree_sitter::Parser] object using a [tree_sitter::Language] object
/// loaded at runtime using [libloading].
///
/// # Safety
/// This struct contains the [libloading::Library] object, from which the [tree_sitter::Language]
/// object is created. If this struct is [Drop]ped, using the lang property will causing a
/// segfault, since it will no longer be in memory.
///
/// That is why the only way to parse using the dynamically loaded Language object, is using
/// this struct's parse method.
///
/// ## Drop
/// When dropping this struct, the Library need to be dropped last. That is why the order
/// of the fields is parser, lang, lib. Changing this order will result in a segfault.
pub struct DynamicParser {
    parser: Parser,
    _lang: Language,
    _lib: Library,
}

impl DynamicParser {
    /// Wrapper method around [tree_sitter::Parser]'s parse method.
    pub fn parse(&mut self, text: impl AsRef<[u8]>, old_tree: Option<&Tree>) -> Option<Tree> {
        self.parser.parse(text, old_tree)
    }

    pub fn new(lib: Library, lang: Language) -> Result<Self> {
        let mut parser = Parser::new();
        parser.set_language(lang)?;

        Ok(Self {
            _lib: lib,
            _lang: lang,
            parser,
        })
    }
}

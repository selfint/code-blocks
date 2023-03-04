use std::path::Path;

use libloading::Library;

use anyhow::Result;
use tree_sitter::{Language, Parser, Query, Tree};

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
/// of the fields is parser, language, library. Changing this order will result in a segfault.
pub struct DynamicParser {
    parser: Parser,
    language: Language,
    _library: Library,
}

impl DynamicParser {
    pub fn load_from(library_path: &Path, language_fn_symbol: &[u8]) -> Result<Self> {
        let (library, language) = unsafe {
            let library = libloading::Library::new(library_path)?;
            let language_fn: libloading::Symbol<unsafe extern "C" fn() -> Language> =
                library.get(language_fn_symbol)?;

            let language = language_fn();

            (library, language)
        };

        let mut parser = Parser::new();
        parser.set_language(language)?;

        Ok(Self {
            language,
            parser,
            _library: library,
        })
    }

    pub fn get_language(&self) -> Language {
        self.language
    }

    /// Wrapper method around [tree_sitter::Parser]'s parse method.
    pub fn parse(&mut self, text: impl AsRef<[u8]>, old_tree: Option<&Tree>) -> Option<Tree> {
        self.parser.parse(text, old_tree)
    }

    pub fn build_query(&self, source: &str) -> Result<Query> {
        Ok(Query::new(self.language, source)?)
    }
}

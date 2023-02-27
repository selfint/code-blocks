use crate::ParserInstaller;

pub enum SupportedParser {
    Rust,
    TypeScript,
    TSX,
    Svelte,
    Python,
}

impl SupportedParser {
    pub fn get_installer(&self) -> ParserInstaller {
        match self {
            Self::Rust => ParserInstaller {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-rust",
                symbol: b"language",
                name: "tree_sitter_rust",
            },
            Self::TypeScript => ParserInstaller {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-typescript",
                symbol: b"language_typescript",
                name: "tree_sitter_typescript",
            },
            Self::TSX => ParserInstaller {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-typescript",
                symbol: b"language_tsx",
                name: "tree_sitter_typescript",
            },
            Self::Svelte => ParserInstaller {
                download_cmd: "git clone https://github.com/Himujjal/tree-sitter-svelte",
                symbol: b"language",
                name: "tree_sitter_svelte",
            },
            Self::Python => ParserInstaller {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-python",
                symbol: b"language",
                name: "tree_sitter_python",
            },
        }
    }
}

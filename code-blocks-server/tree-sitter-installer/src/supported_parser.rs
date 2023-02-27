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
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-rust"
                    .to_string(),
                symbol: b"language".to_vec(),
                name: "tree_sitter_rust".to_string(),
            },
            Self::TypeScript => ParserInstaller {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-typescript"
                    .to_string(),
                symbol: b"language_typescript".to_vec(),
                name: "tree_sitter_typescript".to_string(),
            },
            Self::TSX => ParserInstaller {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-typescript"
                    .to_string(),
                symbol: b"language_tsx".to_vec(),
                name: "tree_sitter_typescript".to_string(),
            },
            Self::Svelte => ParserInstaller {
                download_cmd: "git clone https://github.com/Himujjal/tree-sitter-svelte"
                    .to_string(),
                symbol: b"language".to_vec(),
                name: "tree_sitter_svelte".to_string(),
            },
            Self::Python => ParserInstaller {
                download_cmd: "git clone https://github.com/tree-sitter/tree-sitter-python"
                    .to_string(),
                symbol: b"language".to_vec(),
                name: "tree_sitter_python".to_string(),
            },
        }
    }
}

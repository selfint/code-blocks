import * as Installer from "../../Installer";

import Parser from "tree-sitter";

export async function testParser(language: string): Promise<void> {
    // fail the test if the parser could not be installed
    const result = await Installer.getLanguage("test-parsers", language, true);
    if (result.status === "err") {
        throw new Error(`Failed to install language: ${result.result}`);
    }

    // check the language can be set
    const parser = new Parser();

    try {
        parser.setLanguage(result.result);
    } catch (error) {
        throw new Error(`Failed to set language: ${JSON.stringify(error)}`);
    }
}

suite("Installer integration tests", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "1m");

    const tests = [
        ["Rust", "rust"],
        ["TypeScript", "typescript"],
        ["TSX", "typescriptreact"],
        ["JavaScript", "javascript"],
        ["Java", "java"],
        ["Python", "python"],
        ["Svelte", "svelte"],
        ["C", "c"],
        ["C++", "cpp"],
        ["C#", "csharp"],
        ["Go", "go"],
        ["Ruby", "ruby"],
        // ["SQL", "sql"],
        ["HTML", "html"],
        ["CSS", "css"],
        ["YAML", "yaml"],
        ["JSON", "json"],
        // ["XML", "xml"],
        ["Markdown", "markdown"],
        // ["LaTeX", "latex"],
        ["Bash", "shellscript"],
        // ["TOML", "toml"],
        // ["Swift", "swift"],
        ["Kotlin", "kotlin"],
        ["Zig", "zig"],
    ];

    tests.forEach(([name, language]) => {
        test(name, async () => await testParser(language));
    });
});

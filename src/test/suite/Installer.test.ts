import * as Installer from "../../Installer";
import * as vscode from "vscode";

import Parser from "tree-sitter";
import { TreeViewer } from "../../TreeViewer";
import { openDocument } from "./testUtils";

export async function testParser(language: string, content?: string): Promise<void> {
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

    // open a document with the language
    void openDocument(content ?? `Language: ${language}`, language);
}

suite("Installer integration tests", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "1m");

    this.beforeAll(function () {
        // open file tree viewer for visual debugging
        void vscode.commands.executeCommand("codeBlocks.openTreeViewer");
        void vscode.workspace.openTextDocument(TreeViewer.uri);
    });

    const prebuiltTests = [
        ["Rust", "rust", "fn foo() {}\nfn bar() {}"],
        ["TypeScript", "typescript", "function foo() {}\nfunction bar() {}"],
        ["TSX", "typescriptreact", "function Foo(a: string) { return <div />; }\nfunction Bar() {  }"],
        ["JavaScript", "javascript", "function foo() {}\nfunction bar() {}"],
        ["Java", "java", "class Foo { public static void main(String[] args) { } }"],
        ["Python", "python", "def foo():\n    pass\n\ndef bar():\n    pass"],
        ["Svelte", "svelte", "<script>function foo() {}</script>\n<p>bar</p>"],
        ["C", "c", "int main() { return 0; }"],
        ["C++", "cpp", "int main() { return 0; }"],
        ["C#", "csharp", "class Foo { static void Main() { } }"],
        ["Go", "go", "package main\n\nfunc main() { }"],
        ["Ruby", "ruby", "def foo\nend\ndef bar\nend"],
        // ["SQL", "sql"],
        ["HTML", "html", "<html></html>"],
        // ["CSS", "css", "body { color: red; }"],
        ["YAML", "yaml", "key: value"],
        ["JSON", "json", '{ "key": "value" }'],
        ["XML", "xml"],
        ["Markdown", "markdown", "# Title"],
        // ["LaTeX", "latex"],
        ["Bash", "shellscript", "echo 'Hello, World!'"],
        ["TOML", "toml"],
        // ["Swift", "swift"],
        ["Kotlin", "kotlin", "fun main() { }"],
        ["Zig", "zig", 'const std = @import("std");\n\npub fn main() void { }'],
    ];

    prebuiltTests.forEach(([name, language, content]) => {
        test(name, async () => await testParser(language, content));
    });
});

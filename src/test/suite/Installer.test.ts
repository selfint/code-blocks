import * as Installer from "../../Installer";
import * as vscode from "vscode";

import { BlockMode, active, activeFileTree } from "../../extension";

import { FileTree } from "../../FileTree";
import { expect } from "chai";

export async function testParser(
    language: string,
    content = ""
): Promise<{ activeEditor: vscode.TextEditor; fileTree: FileTree }> {
    if (!active.get()) {
        active.set(true);
    }

    if (!BlockMode.blockModeActive.get()) {
        BlockMode.toggleBlockMode();
    }

    // install the parser
    const result = await Installer.getLanguage("test-parsers", language, true);

    if (result.status === "err") {
        // fail the test if the parser could not be installed
        throw new Error(`Failed to install parser: ${result.result}`);
    }

    const activeEditor = await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument({
            language,
            content,
        })
    );

    let fileTree = activeFileTree.get();
    if (fileTree === undefined) {
        fileTree = await new Promise<FileTree>((r) => {
            activeFileTree.onDidChange((fileTree) => {
                if (fileTree !== undefined) {
                    r(fileTree);
                }
            });
        });
    }

    return { activeEditor, fileTree };
}

suite("Installer integration tests", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "1m");

    suite("Rust", function () {
        test("Hello world", async function () {
            const { activeEditor, fileTree } = await testParser(
                "rust",
                'fn main() {\n    println!("Hello, world!");\n}'
            );

            expect(activeEditor.document.languageId).to.equal("rust");
            expect(fileTree).to.not.be.undefined;
        });
    });

    suite("Java", function () {
        test("Hello world", async function () {
            const { activeEditor, fileTree } = await testParser(
                "java",
                'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}'
            );

            expect(activeEditor.document.languageId).to.equal("java");
            expect(fileTree).to.not.be.undefined;
        });
    });
});

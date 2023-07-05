import * as vscode from "vscode";
import { FileTree } from "../../FileTree";
import { activeFileTree } from "../../extension";

/**
 * Languages with .wasm parsers tracked by git
 */
export type SupportedTestLanguages = "rust" | "typescriptreact";
export async function openDocument(
    content: string,
    language: SupportedTestLanguages
): Promise<{ activeEditor: vscode.TextEditor; fileTree: FileTree }> {
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

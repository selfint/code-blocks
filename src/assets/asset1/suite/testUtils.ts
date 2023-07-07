import * as vscode from "vscode";
import { BlockMode, active, activeFileTree } from "../../../extension";
import { FileTree } from "../../../FileTree";

/**
 * Languages with .wasm parsers tracked by git
 */
export type SupportedTestLanguages = "rust" | "typescriptreact";
export async function openDocument(
    content: string,
    language: SupportedTestLanguages
): Promise<{ activeEditor: vscode.TextEditor; fileTree: FileTree }> {
    if (!active.get()) {
        active.set(true);
    }

    if (!BlockMode.blockModeActive.get()) {
        BlockMode.toggleBlockMode();
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

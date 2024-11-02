import * as vscode from "vscode";
import { BlockMode, active, activeFileTree } from "../../extension";
import { FileTree } from "../../FileTree";

export async function openDocument(
    content: string,
    language: string
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

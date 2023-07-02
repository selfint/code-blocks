import * as vscode from "vscode";
import { FileTree } from "./FileTree";

export class TreeViewer implements vscode.TextDocumentContentProvider {
    public static readonly scheme = "codeBlocks";
    public static readonly uri = vscode.Uri.parse(`${TreeViewer.scheme}://view/tree`);
    public static readonly placeholder = "Syntax tree not available";
    public readonly eventEmitter = new vscode.EventEmitter<vscode.Uri>();
    public onDidChange: vscode.Event<vscode.Uri> = this.eventEmitter.event;

    private fileTree: FileTree | undefined = undefined;
    private static singleton: TreeViewer | undefined = undefined;
    public static treeViewer =
        TreeViewer.singleton ??
        ((): TreeViewer => {
            TreeViewer.singleton = new TreeViewer();
            return TreeViewer.singleton;
        })();

    private constructor() {
        /* */
    }

    public static async open(): Promise<void> {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(TreeViewer.uri), {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true,
            preview: true,
        });
    }

    public static viewFileTree(fileTree: FileTree | undefined): void {
        this.treeViewer.fileTree = fileTree;
        this.treeViewer.eventEmitter.fire(TreeViewer.uri);
        this.treeViewer.fileTree?.onUpdate(() => this.treeViewer.eventEmitter.fire(TreeViewer.uri));
    }

    provideTextDocumentContent(_uri: vscode.Uri, _ct: vscode.CancellationToken): string {
        return this.fileTree?.toString() ?? TreeViewer.placeholder;
    }
}

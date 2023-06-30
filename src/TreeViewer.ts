import * as vscode from "vscode";
import { FileTree } from "./FileTree";

export class TreeViewer implements vscode.TextDocumentContentProvider {
    public static readonly scheme = "codeBlocks";
    public static readonly uri = vscode.Uri.parse(`${TreeViewer.scheme}://view`);
    readonly eventEmitter = new vscode.EventEmitter<vscode.Uri>();
    onDidChange: vscode.Event<vscode.Uri> | undefined = this.eventEmitter.event;

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

    public async open(): Promise<void> {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(TreeViewer.uri), {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true,
            preview: true,
        });
    }

    public viewFileTree(fileTree: FileTree | undefined): void {
        this.fileTree = fileTree;
        this.eventEmitter.fire(TreeViewer.uri);
        this.fileTree?.onUpdate(() => this.eventEmitter.fire(TreeViewer.uri));
    }

    provideTextDocumentContent(_uri: vscode.Uri, _ct: vscode.CancellationToken): string {
        return this.fileTree?.toString() ?? "Syntax tree not available";
    }
}

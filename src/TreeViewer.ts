import * as Installer from "./Installer";
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

    public async open(parsersDir: string): Promise<void> {
        // only update viewer manually when we first open the tree view editor
        const openedDocuments = vscode.workspace.textDocuments;
        const updateManually = !openedDocuments.some((e) => e.uri.toString() === TreeViewer.uri.toString());

        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(TreeViewer.uri), {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true,
            preview: true,
        });

        if (updateManually) {
            await this.update(parsersDir, vscode.window.activeTextEditor);
        }
    }

    public async update(parsersDir: string, editor: vscode.TextEditor | undefined): Promise<void> {
        if (editor === undefined) {
            TreeViewer.treeViewer.viewFileTree(undefined);
            return;
        }

        const activeDocument = editor.document;
        const language = await Installer.getLanguage(parsersDir, activeDocument.languageId);
        if (language === undefined) {
            this.viewFileTree(undefined);
            return;
        }

        const fileTree = await FileTree.new(language, activeDocument);
        this.viewFileTree(fileTree);
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

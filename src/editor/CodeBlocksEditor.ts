import * as codeBlocks from "../codeBlocks";
import * as vscode from "vscode";
import { BlockLocation, BlockLocationTree, MoveCommand, UpdateMessage } from "./messages";
import { FileTree } from "../FileTree";
import { Query } from "web-tree-sitter";
import { getNonce } from "../utilities/getNonce";
import { getUri } from "../utilities/getUri";

function blockToBlockLocation(block: codeBlocks.Block): BlockLocation {
    const head = block[0];
    const tail = block[block.length - 1];

    return {
        startByte: head.startIndex,
        endByte: tail.endIndex,
        startRow: head.startPosition.row,
        startCol: head.startPosition.column,
        endRow: tail.endPosition.row,
        endCol: tail.endPosition.column,
    };
}

export function blockTreeToBlockLocationTree(blockTree: codeBlocks.BlockTree): BlockLocationTree {
    const block = blockToBlockLocation(blockTree.block);
    const children = blockTree.children.map(blockTreeToBlockLocationTree);
    return { block, children };
}

export class CodeBlocksEditor {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly document: vscode.TextDocument,
        private readonly webviewPanel: vscode.WebviewPanel,
        private readonly queries: Query[],
        private readonly fileTree: FileTree
    ) {
        this.initWebview();
        this.subscribeToDocEvents();

        // first draw of ui triggered manually
        this.drawBlocks().catch((e) => {
            throw new Error(`Failed to draw blocks: ${JSON.stringify(e)}`);
        });
    }

    private async drawBlocks(): Promise<void> {
        const blockTrees = codeBlocks.getBlockTrees(this.fileTree.tree, this.queries);
        const blockLocationTrees = blockTrees.map(blockTreeToBlockLocationTree);

        await this.webviewPanel.webview.postMessage({
            type: "update",
            text: this.document.getText(),
            blockTrees: blockLocationTrees,
        } as UpdateMessage);
    }

    private async moveBlock(_message: MoveCommand): Promise<void> {
        // const args: MoveBlockArgs = {
        //     queries: this.queries,
        //     text: this.document.getText(),
        //     libraryPath: this.libraryPath,
        //     languageFnSymbol: this.languageFnSymbol,
        //     srcBlock: message.args.src,
        //     dstBlock: message.args.dst,
        //     force: false,
        // };
        // const response = await core.moveBlock(this.codeBlocksCliPath, args);
        // if (response === undefined) {
        //     return;
        // }
        // const edit = new vscode.WorkspaceEdit();
        // edit.replace(this.document.uri, new vscode.Range(0, 0, this.document.lineCount, 0), response.text);
        // await vscode.workspace.applyEdit(edit);
    }

    private initWebview(): void {
        const webview = this.webviewPanel.webview;
        const extensionUri = this.context.extensionUri;

        const stylesUri = getUri(webview, extensionUri, ["webview-ui", "public", "build", "bundle.css"]);
        const scriptUri = getUri(webview, extensionUri, ["webview-ui", "public", "build", "bundle.js"]);

        const nonce = getNonce();

        webview.options = {
            enableScripts: true,
        };

        webview.html = /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Code Blocks editor</title>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
              webview.cspSource
          }; script-src 'nonce-${nonce}';">
          <link rel="stylesheet" type="text/css" href="${stylesUri.toString()}">
          <script defer nonce="${nonce}" src="${scriptUri.toString()}"></script>
        </head>
        <body>
        </body>
      </html>
    `;
    }

    private subscribeToDocEvents(): void {
        const disposables: vscode.Disposable[] = [];
        const webviewPanel = this.webviewPanel;

        // handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(
            async (message: MoveCommand) => this.moveBlock(message),
            undefined,
            disposables
        );

        // re-render ui when webview becomes visible again
        webviewPanel.onDidChangeViewState(
            async (e: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
                if (e.webviewPanel.visible) {
                    await this.drawBlocks();
                }
            },
            undefined,
            disposables
        );

        // re-render ui when this document's text changes
        vscode.workspace.onDidChangeTextDocument(
            async (e: vscode.TextDocumentChangeEvent) => {
                if (e.document.uri.toString() === this.document.uri.toString()) {
                    this.fileTree.update(e);
                    await this.drawBlocks();
                }
            },
            undefined,
            disposables
        );

        webviewPanel.onDidDispose(() =>
            disposables.forEach((d) => {
                d.dispose();
            })
        );
    }
}

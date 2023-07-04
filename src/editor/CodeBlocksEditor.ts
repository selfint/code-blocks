import * as vscode from "vscode";
import { Block, BlockTree, getBlockTrees } from "../BlockTree";
import { BlockLocation, BlockLocationTree, MoveCommand, UpdateMessage } from "./messages";
import { FileTree } from "../FileTree";
import { Query } from "web-tree-sitter";
import { getNonce } from "../utilities/getNonce";
import { getUri } from "../utilities/getUri";

function blockToBlockLocation(block: Block): BlockLocation {
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

function blockTreeToBlockLocationTree(blockTree: BlockTree): BlockLocationTree {
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
        const blockTrees = getBlockTrees(this.fileTree.tree, this.queries);
        const blockLocationTrees = blockTrees.map(blockTreeToBlockLocationTree);

        await this.webviewPanel.webview.postMessage({
            type: "update",
            text: this.document.getText(),
            blockTrees: blockLocationTrees,
        } as UpdateMessage);
    }

    private async moveBlock(message: MoveCommand): Promise<void> {
        const { src, dst } = message.args;
        const srcSelection = this.fileTree.resolveVscodeSelection(
            new vscode.Selection(
                new vscode.Position(src.startRow, src.startCol),
                new vscode.Position(src.endRow, src.endCol)
            )
        );
        const dstSelection = this.fileTree.resolveVscodeSelection(
            new vscode.Selection(
                new vscode.Position(dst.startRow, dst.startCol),
                new vscode.Position(dst.endRow, dst.endCol)
            )
        );

        if (srcSelection === undefined || dstSelection === undefined) {
            return;
        }

        const srcParent = srcSelection.getParent();
        const dstParent = dstSelection.getParent();

        // ensure either parents are equal, or force is enabled
        const userRequestsForce = async (): Promise<boolean> =>
            (await vscode.window.showErrorMessage(
                "Move is between scopes, try force moving?",
                "Ok",
                "No"
            )) === "Ok";

        if (!srcParent || !dstParent) {
            if (srcParent !== dstParent) {
                if (!(await userRequestsForce())) {
                    return;
                }
            }
        } else if (!srcParent.equals(dstParent)) {
            if (!(await userRequestsForce())) {
                return;
            }
        }

        const result = await this.fileTree.teleportSelection(srcSelection, dstSelection);
        if (result.status === "err") {
            void vscode.window.showErrorMessage(`Failed to move block: ${result.result}`);
        }
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
        const disposables: vscode.Disposable[] = [this.fileTree];
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
        this.fileTree.onUpdate(async () => await this.drawBlocks());

        webviewPanel.onDidDispose(() =>
            disposables.forEach((d) => {
                d.dispose();
            })
        );
    }
}

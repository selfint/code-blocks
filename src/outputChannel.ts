import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined = undefined;

export function getLogger(): vscode.OutputChannel {
    if (channel === undefined) {
        channel = vscode.window.createOutputChannel("CodeBlocks");
    }

    return channel;
}

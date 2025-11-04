import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined = undefined;

type Logger = {
    log: (message: string) => void;
};

export function getLogger(): Logger {
    if (channel === undefined) {
        channel = vscode.window.createOutputChannel("CodeBlocks");
    }

    return {
        log: (message: string): void => {
            channel?.appendLine(message);
            console.error(message.slice(0, 300));
        },
    };
}

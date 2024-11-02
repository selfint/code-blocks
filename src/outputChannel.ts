import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined = undefined;

type Logger = {
    log: (message: string) => void;
};

export function getLogger(): Logger {
    // TODO: hack to support logging in and out of vscode context
    try {
        if (channel === undefined) {
            channel = vscode.window.createOutputChannel("CodeBlocks");
        }

        return {
            log: (message: string): void => {
                channel?.appendLine(message);
            },
        };
    } catch (error) {
        return {
            log: (message: string): void => {
                console.log(message);
            },
        };
    }
}

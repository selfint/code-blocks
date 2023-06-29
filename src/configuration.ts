import * as vscode from "vscode";

export type LanguageConfig = {
    npmPackageName: string;
    parserName: string;
    subdirectory?: string;
    queries?: string[];
};
export function getLanguageConfig(languageId: string): LanguageConfig {
    function get<C>(c: string, d?: C): C {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return vscode.workspace.getConfiguration(`[${languageId}]`)[`codeBlocks.${c}`] ?? d;
    }

    return {
        npmPackageName: get("npmPackageName", `tree-sitter-${languageId}`),
        parserName: get("parserName", `tree-sitter-${languageId}`),
        subdirectory: get("subdirectory"),
        queries: get("queries"),
    };
}

export function getIgnoredLanguageIds(): string[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return vscode.workspace.getConfiguration("codeBlocks").ignoredLanguageIds ?? [];
}

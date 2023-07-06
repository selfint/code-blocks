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

    const npmPackageName = get("npmPackageName", `tree-sitter-${languageId}`);
    return {
        npmPackageName,
        parserName: get("parserName", npmPackageName),
        subdirectory: get("subdirectory"),
        queries: get("queries"),
    };
}

export function getIgnoredLanguageIds(): string[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return vscode.workspace.getConfiguration("codeBlocks").ignoredLanguageIds ?? [];
}

export type ColorConfig = { enabled: boolean; siblingColor: string; parentColor: string };
export function getColorConfig(): ColorConfig {
    const defaultSiblingColor = "var(--vscode-editor-selectionHighlightBackground)";
    const defaultParentColor = "var(--vscode-editor-linkedEditingBackground)";
    const colorConfig = vscode.workspace.getConfiguration("codeBlocks").get<ColorConfig>("colors");

    return {
        enabled: colorConfig?.enabled ?? true,
        siblingColor: colorConfig?.siblingColor ?? defaultSiblingColor,
        parentColor: colorConfig?.parentColor ?? defaultParentColor,
    };
}

import * as vscode from "vscode";
import { Result, err, ok } from "./result";

export type LanguageConfig = {
    npmPackageName: string;
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
        subdirectory: get("subdirectory"),
        queries: get("queries"),
    };
}

export function getIgnoredLanguageIds(): string[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return vscode.workspace.getConfiguration("codeBlocks").ignoredLanguageIds ?? [];
}

export async function addIgnoredLanguageId(languageId: string): Promise<Result<void, string>> {
    const config = vscode.workspace.getConfiguration("codeBlocks");
    const section = "ignoredLanguageIds";
    let ignoredLanguageIds = config.get<string[]>(section);
    if (ignoredLanguageIds?.includes(languageId)) {
        return ok(undefined);
    }

    ignoredLanguageIds = [languageId, ...(ignoredLanguageIds ?? [])];
    try {
        await config.update(section, ignoredLanguageIds);
        return ok(undefined);
    } catch (error: unknown) {
        return err(JSON.stringify(error));
    }
}

export type ColorConfig = { enabled: boolean; siblingColor: string; parentColor: string };
export function getColorConfig(): ColorConfig {
    const defaultSiblingColor = "var(--vscode-editor-selectionHighlightBackground)";
    const defaultParentColor = "var(--vscode-editor-linkedEditingBackground)";
    const colorConfig = vscode.workspace.getConfiguration("codeBlocks").get<ColorConfig>("colors");

    return {
        enabled: colorConfig?.enabled ?? false,
        siblingColor: colorConfig?.siblingColor ?? defaultSiblingColor,
        parentColor: colorConfig?.parentColor ?? defaultParentColor,
    };
}

export function getTreeSitterCliPath(): string {
    const treeSitterCliPath = vscode.workspace
        .getConfiguration("codeBlocks")
        .get<string>("treeSitterCliPath");

    return treeSitterCliPath ?? "tree-sitter";
}

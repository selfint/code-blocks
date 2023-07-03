import * as configuration from "./configuration";
import * as path from "path";
import * as tar from "tar";
import * as vscode from "vscode";
import { ExecException, ExecOptions, exec } from "child_process";
import { Language } from "web-tree-sitter";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { parserFinishedInit } from "./extension";

export function getAbsoluteParserDir(parsersDir: string, npmPackageName: string): string {
    return path.resolve(path.join(parsersDir, npmPackageName));
}

export function getWasmBindingsPath(parsersDir: string, npmPackageName: string, parserName?: string): string {
    // this path assumes the .wasm file was built in the parser dir
    return path.join(
        getAbsoluteParserDir(parsersDir, npmPackageName),
        `${parserName ?? npmPackageName}.wasm`
    );
}

export async function loadParser(
    parsersDir: string,
    npmPackageName: string,
    parserName?: string
): Promise<Language | undefined> {
    const wasmPath = getWasmBindingsPath(parsersDir, npmPackageName, parserName);
    if (!existsSync(wasmPath)) {
        return undefined;
    } else {
        await parserFinishedInit;
        try {
            return await Language.load(wasmPath);
        } catch (error) {
            console.log(`Failed to load ${wasmPath}, due to error:`);
            console.log(error);
            return undefined;
        }
    }
}

export async function downloadParser(
    parsersDir: string,
    parserNpmPackage: string,
    subdirectory?: string,
    onData?: (data: string) => void,
    npm = "npm",
    treeSitterCli = "tree-sitter"
): Promise<boolean> {
    const parserDir = getAbsoluteParserDir(parsersDir, parserNpmPackage);
    await mkdir(parserDir, { recursive: true });

    const installResult = await runCmd(
        `${npm} pack --verbose --json --pack-destination ${parserDir} ${parserNpmPackage}`,
        {},
        onData
    );

    let tarFilename: string | undefined = undefined;
    switch (installResult.status) {
        case "err":
            console.log("Failed to install, err:");
            console.log(installResult.result);
            return false;

        case "ok":
            tarFilename = (JSON.parse(installResult.result) as { filename: string }[])[0].filename;
    }

    try {
        await tar.extract({
            file: path.resolve(path.join(parserDir, tarFilename)),
            cwd: parserDir,
            strip: 1,
            onentry: (entry) => onData?.(entry.path),
        });
    } catch (e: unknown) {
        onData?.(`failed to extract ${tarFilename} to ${parserDir}, due to err: ${JSON.stringify(e)}`);
        return false;
    }

    const buildResult = await runCmd(
        `${treeSitterCli} build-wasm ${subdirectory ?? ""}`,
        { cwd: parserDir },
        onData
    );
    switch (buildResult.status) {
        case "err":
            onData?.(`Failed to build .wasm parser, err: ${JSON.stringify(buildResult.result)}`);
            return false;

        case "ok":
            return true;
    }
}

type Result<T, E> = { status: "ok"; result: T } | { status: "err"; result: E };
async function runCmd(
    cmd: string,
    options: ExecOptions,
    onData?: (data: string) => void
): Promise<Result<string, ExecException>> {
    return await new Promise((resolve) => {
        const proc = exec(cmd, options, (err, stdout: string, _stderr) => {
            if (err !== null) {
                resolve({ status: "err", result: err });
            } else {
                resolve({ status: "ok", result: stdout });
            }
        });

        if (onData !== undefined) {
            proc.stdout?.on("data", onData);
            proc.stderr?.on("data", onData);
        }
    });
}

export async function getLanguage(parsersDir: string, languageId: string): Promise<Language | undefined> {
    const ignoredLanguageIds = configuration.getIgnoredLanguageIds();
    if (ignoredLanguageIds.includes(languageId)) {
        return undefined;
    }

    const { npmPackageName, subdirectory, parserName } = configuration.getLanguageConfig(languageId);
    const parserWasmBindings = getWasmBindingsPath(parsersDir, npmPackageName, parserName);

    const npm = "npm";
    const treeSitterCli = "tree-sitter";

    await parserFinishedInit;

    if (!existsSync(parserWasmBindings)) {
        const doInstall = await vscode.window.showInformationMessage(
            `Parser missing for language '${languageId}', install it?`,
            "Yes",
            "No"
        );
        if (doInstall !== "Yes") {
            return undefined;
        }

        let number = 0;
        const downloaded = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: `Installing ${parserName}`,
            },
            async (progress) => {
                return await downloadParser(
                    parsersDir,
                    npmPackageName,
                    subdirectory,
                    (data) => progress.report({ message: data, increment: number++ }),
                    npm,
                    treeSitterCli
                );
            }
        );

        if (!downloaded) {
            void vscode.window.showErrorMessage(`Failed to download parser for language ${languageId}`);
            return undefined;
        }
    }

    const language = await loadParser(parsersDir, npmPackageName, parserName);
    if (language === undefined) {
        void vscode.window.showErrorMessage(`Failed to load parser for language ${languageId}`);
        return undefined;
    }

    return language;
}

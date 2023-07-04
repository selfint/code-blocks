import * as configuration from "./configuration";
import * as path from "path";
import * as tar from "tar";
import * as vscode from "vscode";
import { ExecException, ExecOptions, exec } from "child_process";
import { Result, err, ok } from "./result";
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
): Promise<Result<Language, string>> {
    const wasmPath = getWasmBindingsPath(parsersDir, npmPackageName, parserName);
    if (!existsSync(wasmPath)) {
        return err(`Expected .wasm parser path doesn't exist: ${wasmPath}`);
    } else {
        await parserFinishedInit;
        try {
            return ok(await Language.load(wasmPath));
        } catch (error) {
            console.debug(`Failed to load ${wasmPath} > ${JSON.stringify(error)}`);
            return err(`Failed to load ${wasmPath} > ${JSON.stringify(error)}`);
        }
    }
}

export async function downloadAndBuildParser(
    parsersDir: string,
    parserNpmPackage: string,
    subdirectory?: string,
    onData?: (data: string) => void,
    npm = "npm",
    treeSitterCli = "tree-sitter"
): Promise<Result<void, string>> {
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
            console.debug(`Failed to install > ${JSON.stringify(installResult.result)}`);
            return err(`Failed to install > ${JSON.stringify(installResult.result)}`);

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
        onData?.(`failed to extract ${tarFilename} to ${parserDir} > ${JSON.stringify(e)}`);
        return err(`failed to extract ${tarFilename} to ${parserDir} > ${JSON.stringify(e)}`);
    }

    const buildCmd = `${treeSitterCli} build-wasm ${subdirectory ?? ""}`;
    onData?.(`Building parser: ${buildCmd}`);

    const buildResult = await runCmd(buildCmd, { cwd: parserDir }, onData);
    switch (buildResult.status) {
        case "err":
            // TODO: check exit code for this error on windows is the same
            if (buildResult.result[0].code === 127) {
                onData?.(`Failed to build .wasm parser because 'tree-sitter' command not in PATH`);
                return err(`Failed to build .wasm parser because 'tree-sitter' command not in PATH`);
            } else if (
                buildResult.result[1].join(" ").includes("emcc") ||
                buildResult.result[1].join(" ").includes("docker")
            ) {
                const errMsg = `Failed to build .wasm parser because 'emcc' command not in PATH, or 'docker' command failed / not in PATH`;
                onData?.(errMsg);
                return err(errMsg);
            } else {
                const errMsg = `Failed to build .wasm parser > shell command '${buildCmd}' failed > error: ${JSON.stringify(
                    buildResult.result[0]
                )}, logs: ${buildResult.result[1].join(" | ")}`;

                onData?.(errMsg);
                return err(errMsg);
            }

        case "ok":
            return ok(undefined);
    }
}

async function runCmd(
    cmd: string,
    options: ExecOptions,
    onData?: (data: string) => void
): Promise<Result<string, [ExecException, string[]]>> {
    const logs: string[] = [];
    return await new Promise((resolve) => {
        const proc = exec(cmd, options, (error, stdout: string, _stderr) => {
            if (error !== null) {
                resolve(err([error, logs]));
            } else {
                resolve(ok(stdout));
            }
        });

        if (onData !== undefined) {
            proc.stdout?.on("data", onData);
            proc.stdout?.on("data", (l) => logs.push(JSON.stringify(l)));
            proc.stderr?.on("data", onData);
            proc.stderr?.on("data", (l) => logs.push(JSON.stringify(l)));
        }
    });
}

export async function getLanguage(
    parsersDir: string,
    languageId: string
): Promise<Result<Language | undefined, string>> {
    const ignoredLanguageIds = configuration.getIgnoredLanguageIds();
    if (ignoredLanguageIds.includes(languageId)) {
        return ok(undefined);
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
            return ok(undefined);
        }

        let number = 0;
        const downloadResult = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: `Installing ${parserName}`,
            },
            async (progress) => {
                return await downloadAndBuildParser(
                    parsersDir,
                    npmPackageName,
                    subdirectory,
                    (data) => progress.report({ message: data, increment: number++ }),
                    npm,
                    treeSitterCli
                );
            }
        );

        if (downloadResult.status === "err") {
            return err(
                `Failed to download/build parser for language ${languageId} > ${downloadResult.result}`
            );
        }
    }

    const loadResult = await loadParser(parsersDir, npmPackageName, parserName);
    switch (loadResult.status) {
        case "err":
            return err(`Failed to load parser for language ${languageId} > ${loadResult.result}`);

        case "ok":
            return ok(loadResult.result);
    }
}

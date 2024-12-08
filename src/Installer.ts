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
import which from "which";

const NPM_INSTALL_URL = "https://nodejs.org/en/download";
const EMCC_INSTALL_URL = "https://emscripten.org/docs/getting_started/downloads.html#download-and-install";
const DOCKER_INSTALL_URL = "https://docs.docker.com/get-docker/";

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
    // typescript-eslint is wrong, this can return null since we use 'nothrow'
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const npmCommandOk = (await which(npm, { nothrow: true })) !== null;
    if (!npmCommandOk) {
        return err(`npm command: '${npm}' is not in PATH, try installing it from: ${NPM_INSTALL_URL}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const treeSitterCliOk = await runCmd(`${treeSitterCli} --version`);
    if (treeSitterCliOk.status === "err") {
        return err(
            `
            tree-sitter cli command '${treeSitterCli}' failed:
            ${treeSitterCliOk.result[0].name} ${treeSitterCliOk.result[0].message.replace("\n", " > ")}.` +
            (treeSitterCliOk.result[1].length > 1 ? ` Logs: ${treeSitterCliOk.result[1].join(">")}` : "")
        );
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const emccOk = (await which("emcc", { nothrow: true })) !== null;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const dockerOk = (await which("docker", { nothrow: true })) !== null;

    if (dockerOk && !emccOk) {
        void vscode.window.showInformationMessage(
            `tree-sitter requirement emcc not found, but docker was found and is being used. Note that using emcc is much faster, try installing if from: ${EMCC_INSTALL_URL}`
        );
    } else if (!dockerOk && !emccOk) {
        return err(
            `tree-sitter requirement emcc/docker (either one) not found, try installing emcc (preferred) from: ${EMCC_INSTALL_URL} or installing docker from: ${DOCKER_INSTALL_URL}`
        );
    }

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

    const buildCmd = `${treeSitterCli} build--wasm ${subdirectory ?? ""}`;
    onData?.(`Building parser: ${buildCmd}`);

    const buildResult = await runCmd(buildCmd, { cwd: parserDir }, onData);
    switch (buildResult.status) {
        case "err": {
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
    options: ExecOptions = {},
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
    const treeSitterCli = configuration.getTreeSitterCliPath();

    await parserFinishedInit;

    if (!existsSync(parserWasmBindings)) {
        const doInstall = await vscode.window.showInformationMessage(
            `Parser missing for language '${languageId}', install it?`,
            "Yes",
            "No",
            "Never"
        );
        if (doInstall === "Never") {
            const result = await configuration.addIgnoredLanguageId(languageId);
            if (result.status === "ok") {
                void vscode.window.showInformationMessage(
                    `Language '${languageId}' added to the ignore list. To remove it, edit your 'codeBlocks.ignoredLanguageIds' config inside the ${path.join(
                        ".",
                        ".vscode",
                        "settings.json"
                    )} file.`
                );
                return ok(undefined);
            } else {
                void vscode.window.showInformationMessage(
                    `Failed to add language '${languageId}' to the ignore list > ${result.result}`
                );
                return ok(undefined);
            }
        }

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

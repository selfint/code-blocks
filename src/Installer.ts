import * as configuration from "./configuration";
import * as path from "path";
import * as tar from "tar";
import * as vscode from "vscode";
import { ExecException, ExecOptions, exec } from "child_process";
import { Result, err, ok } from "./result";
import { existsSync, rmSync } from "fs";
import Parser from "tree-sitter";
import { getLogger } from "./outputChannel";
import { mkdir } from "fs/promises";
import which from "which";

const NPM_INSTALL_URL = "https://nodejs.org/en/download";

export type Language = Parser.Language;

export function getAbsoluteParserDir(parsersDir: string, parserName: string): string {
    return path.resolve(path.join(parsersDir, parserName));
}

export function getAbsoluteBindingsDir(parsersDir: string, parserName: string): string {
    return path.resolve(path.join(parsersDir, parserName, "bindings", "node", "index.js"));
}

export function loadParser(
    parsersDir: string,
    parserName: string,
    subdirectory?: string
): Result<Language, string> {
    const logger = getLogger();

    const bindingsDir = getAbsoluteBindingsDir(parsersDir, parserName);
    if (!existsSync(bindingsDir)) {
        const msg = `Expected parser directory doesn't exist: ${bindingsDir}`;
        logger.log(msg);
        return err(msg);
    }

    try {
        logger.log(`Loading parser from ${bindingsDir}`);

        // using dynamic import causes issues on windows
        // make sure to test well on windows before changing this
        // TODO(02/11/24): change to dynamic import
        // let { default: language } = (await import(bindingsDir)) as { default: Language };

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        let language = require(bindingsDir) as Language;

        logger.log(`Got language: ${JSON.stringify(Object.keys(language))}`);

        if (subdirectory !== undefined) {
            logger.log(`Loading subdirectory: ${subdirectory}`);
            // @ts-expect-error we know this is a language
            language = language[subdirectory] as Language;

            logger.log(`Got subdirectory language: ${JSON.stringify(Object.keys(language))}`);
        }

        return ok(language);
    } catch (error) {
        logger.log(`Failed to load ${bindingsDir} > ${JSON.stringify(error)}`);
        return err(`Failed to load ${bindingsDir} > ${JSON.stringify(error)}`);
    }
}

export async function downloadAndBuildParser(
    parsersDir: string,
    parserNpmPackage: string,
    parserName: string,
    npm: string,
    treeSitterCli: string,
    onData?: (data: string) => void
): Promise<Result<void, string>> {
    const logger = getLogger();

    // typescript-eslint is wrong, this can return null since we use 'nothrow'
    const npmCommandOk = (await which(npm, { nothrow: true })) !== null;
    if (!npmCommandOk) {
        const msg = `npm command: '${npm}' is not in PATH, try installing it from: ${NPM_INSTALL_URL}`;
        logger.log(msg);
        return err(msg);
    }

    logger.log(`Installing parser ${parserNpmPackage} to ${parsersDir}`);

    const parserDir = getAbsoluteParserDir(parsersDir, parserName);
    await mkdir(parserDir, { recursive: true });

    const installResult = await runCmd(
        `${npm} pack --verbose --json --pack-destination ${parserDir} ${parserNpmPackage}`,
        {},
        (d) => onData?.(d.toString())
    );

    let tarFilename: string | undefined = undefined;
    switch (installResult.status) {
        case "err":
            logger.log(`Failed to install > ${JSON.stringify(installResult.result)}`);
            return err(`Failed to install > ${JSON.stringify(installResult.result)}`);

        case "ok":
            tarFilename = (JSON.parse(installResult.result) as { filename: string }[])[0].filename;
    }

    logger.log(`Download success. Extracting ${tarFilename} to ${parserDir}`);

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

    // try to load parser optimistically
    const loadResult = loadParser(parsersDir, parserName);
    if (loadResult.status === "ok") {
        return ok(undefined);
    }

    logger.log(`Optimistic load failed, trying to build parser ${parserName}`);
    const treeSitterCliOk = await runCmd(`${treeSitterCli} --version`);
    if (treeSitterCliOk.status === "err") {
        const msg =
            `Parser ${parserName} requires local build, but
            tree-sitter cli command '${treeSitterCli}' failed:
            ${treeSitterCliOk.result[0].name} ${treeSitterCliOk.result[0].message.replace(/\n/g, " > ")}.` +
            (treeSitterCliOk.result[1].length > 1 ? ` Logs: ${treeSitterCliOk.result[1].join(">")}` : "");

        logger.log(msg);
        return err(msg);
    }

    // if it fails, try to build it
    const buildResult = await runCmd(`${treeSitterCli} generate`, { cwd: parserDir }, (d) =>
        onData?.(d.toString())
    );
    if (buildResult.status === "err") {
        const msg =
            "Failed to build parser using tree-sitter cli > " +
            buildResult.result[0].name +
            ": " +
            buildResult.result[0].message.replace(/\n/g, " > ") +
            (buildResult.result[1].length > 1 ? ` Logs: ${buildResult.result[1].join(">")}` : "");

        logger.log(msg);
        return err(msg);
    }

    logger.log(`Built parser ${parserName} successfully`);

    return ok(undefined);
}

async function runCmd(
    cmd: string,
    options: ExecOptions = {},
    onData?: (data: Buffer) => void
): Promise<Result<string, [ExecException, string[]]>> {
    const logger = getLogger();
    logger.log(`Running command: ${cmd}`);

    const logs: string[] = [];
    return await new Promise((resolve) => {
        const proc = exec(cmd, options, (error, stdout: string | Buffer, _stderr) => {
            if (error !== null) {
                resolve(err([error, logs]));
            } else {
                resolve(ok(stdout.toString()));
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

export type GetLanguageError = {
    cause: "downloadFailed" | "loadFailed";
    msg: string;
};

export async function getLanguage(
    parsersDir: string,
    languageId: string,
    autoInstall = false
): Promise<Result<Language | undefined, GetLanguageError>> {
    const logger = getLogger();

    const ignoredLanguageIds = configuration.getIgnoredLanguageIds();
    if (ignoredLanguageIds.includes(languageId)) {
        logger.log(`Language ${languageId} is ignored`);
        return ok(undefined);
    }

    const { npmPackageName, subdirectory, parserName } = configuration.getLanguageConfig(languageId);
    const parserPackagePath = getAbsoluteParserDir(parsersDir, parserName);

    const npm = "npm";
    const treeSitterCli = configuration.getTreeSitterCliPath();

    if (!existsSync(parserPackagePath)) {
        const doInstall = autoInstall
            ? "Yes"
            : await vscode.window.showInformationMessage(
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

                logger.log(`Language ${languageId} added to the ignore list`);
                return ok(undefined);
            } else {
                void vscode.window.showInformationMessage(
                    `Failed to add language '${languageId}' to the ignore list > ${result.result}`
                );

                logger.log(`Failed to add language ${languageId} to the ignore list > ${result.result}`);
                return ok(undefined);
            }
        }

        if (doInstall !== "Yes") {
            logger.log(`Not installing language ${languageId}, user refused`);
            return ok(undefined);
        }

        let number = 0;
        const downloadResult = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: `Installing ${npmPackageName}`,
            },
            async (progress) => {
                return await downloadAndBuildParser(
                    parsersDir,
                    npmPackageName,
                    parserName,
                    npm,
                    treeSitterCli,
                    (data) => progress.report({ message: data, increment: number++ })
                );
            }
        );

        if (downloadResult.status === "err") {
            const msg = `Failed to download/build parser for language ${languageId} > ${downloadResult.result}`;

            logger.log(msg);
            return err({ cause: "downloadFailed", msg });
        }
    }

    const loadResult = loadParser(parsersDir, parserName, subdirectory);
    if (loadResult.status === "err") {
        const msg = `Failed to load parser for language ${languageId} > ${loadResult.result}`;

        logger.log(msg);
        return err({ cause: "loadFailed", msg });
    }

    logger.log(`Successfully loaded parser for language ${languageId}`);
    return ok(loadResult.result);
}

export async function askRemoveLanguage(parsersDir: string, languageId: string, msg: string): Promise<void> {
    const doRemove = await vscode.window.showErrorMessage(
        `Failed to load parser for ${languageId}: ${msg}`,
        "Remove",
        "Ok"
    );

    if (doRemove === "Remove") {
        removeLanguage(parsersDir, languageId);
    }
}

export function removeLanguage(parsersDir: string, languageId: string): void {
    const logger = getLogger();

    const { parserName } = configuration.getLanguageConfig(languageId);
    const parserPackagePath = getAbsoluteParserDir(parsersDir, parserName);

    if (existsSync(parserPackagePath)) {
        rmSync(parserPackagePath, { recursive: true, force: true });
    }
    logger.log(`Removed parser '${parserPackagePath}'`);
}

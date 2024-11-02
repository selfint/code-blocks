import * as configuration from "./configuration";
import * as path from "path";
import * as tar from "tar";
import * as vscode from "vscode";
import { ExecException, ExecOptions, exec } from "child_process";
import { Result, err, ok } from "./result";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { parserFinishedInit } from "./extension";
import which from "which";
import { getLogger } from "./outputChannel";
import Parser from "tree-sitter";

const NPM_INSTALL_URL = "https://nodejs.org/en/download";

export type Language = NonNullable<unknown>;

export function getAbsoluteParserDir(parsersDir: string, parserName: string): string {
    return path.resolve(path.join(parsersDir, parserName));
}

export function getAbsoluteBindingsPath(parsersDir: string, parserName: string): string {
    return path.resolve(path.join(parsersDir, parserName, "bindings", "node", "index.js"));
}

export async function loadParser(
    parsersDir: string,
    parserName: string,
    subdirectory?: string
): Promise<Result<Language, string>> {
    const logger = getLogger();

    const parserBindings = getAbsoluteBindingsPath(parsersDir, parserName);

    logger.appendLine(`Loading parser ${parserName} bindings: ${parserBindings}`);

    if (!existsSync(parserBindings)) {
        logger.appendLine(`Parser bindings don't exist at expected path: ${parserBindings}`);
        return err(`Parser bindings don't exist at expected path: ${parserBindings}`);
    } else {
        await parserFinishedInit;
        try {
            let { default: language } = (await import(parserBindings)) as { default: Language };
            logger.appendLine(`Imported parser ${parserName}: ${JSON.stringify(Object.keys(language))}`);

            if (subdirectory !== undefined) {
                logger.appendLine(`Loading subdirectory: ${subdirectory}`);

                // @ts-expect-error we know this is a language
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                language = language[subdirectory] as Language | undefined;

                if (language === undefined) {
                    logger.appendLine(`Parser subdirectory was undefined: ${subdirectory}`);
                    return err(`Parser subdirectory was undefined: ${subdirectory}`);
                }

                logger.appendLine(
                    `Loaded subdirectory ${subdirectory}: ${JSON.stringify(Object.keys(language))}`
                );
            }

            const parser = new Parser();
            try {
                parser.setLanguage(language);
            } catch (error) {
                logger.appendLine(`Loaded invalid language > ${JSON.stringify(error)}`);
                return err(`Loaded invalid language > ${JSON.stringify(error)}`);
            }

            logger.appendLine(`Loaded parser ${parserName}`);
            return ok(language);
        } catch (error) {
            logger.appendLine(`Failed to load ${parserBindings} > ${JSON.stringify(error)}`);
            return err(`Failed to load ${parserBindings} > ${JSON.stringify(error)}`);
        }
    }
}

export async function installParser(
    parsersDir: string,
    parserNpmPackage: string,
    parserName: string,
    npm: string,
    treeSitterCli: string,
    subdirectory?: string,
    onData?: (data: string) => void
): Promise<Result<Language, string>> {
    const logger = getLogger();
    logger.appendLine(`Installing parser: ${parserNpmPackage}`);

    // typescript-eslint is wrong, this can return null since we use 'nothrow'
    const npmCommandOk = (await which(npm, { nothrow: true })) !== null;
    if (!npmCommandOk) {
        return err(`npm command: '${npm}' is not in PATH, try installing it from: ${NPM_INSTALL_URL}`);
    }

    const parserDir = getAbsoluteParserDir(parsersDir, parserName);
    await mkdir(parserDir, { recursive: true });

    const installResult = await runCmd(
        `${npm} pack --verbose --json --pack-destination ${parserDir} ${parserNpmPackage}`,
        {},
        onData
    );

    let tarFilename: string | undefined = undefined;
    switch (installResult.status) {
        case "err":
            logger.appendLine(`Failed to install: ${JSON.stringify(installResult.result)}`);
            return err(`Failed to install > ${JSON.stringify(installResult.result)}`);

        case "ok":
            tarFilename = (JSON.parse(installResult.result) as { filename: string }[])[0].filename;
    }

    try {
        logger.appendLine(`Extracting ${tarFilename} to ${parserDir}`);
        await tar.extract({
            file: path.resolve(path.join(parserDir, tarFilename)),
            cwd: parserDir,
            strip: 1,
            onentry: (entry) => onData?.(entry.path),
        });
    } catch (e: unknown) {
        const msg = `Failed to extract ${tarFilename} to ${parserDir} > ${JSON.stringify(e)}`;

        logger.appendLine(msg);
        onData?.(msg);
        return err(msg);
    }

    // try to load parser, without building it
    let loadResult = await loadParser(parsersDir, parserName, subdirectory);
    if (loadResult.status === "ok") {
        // try to set language
        try {
            const parser = new Parser();

            parser.setLanguage(loadResult.result);
            return ok(loadResult.result);
        } catch (error) {
            logger.appendLine(`Optimistic load failed > ${JSON.stringify(error)}`);
        }
    }

    logger.appendLine(`Building parser: ${parserName}`);

    // we need to build the parser
    const treeSitterCliOk = await runCmd(`${treeSitterCli} --version`);
    if (treeSitterCliOk.status === "ok") {
        // build parser using tree-sitter cli
        const buildResult = await runCmd(`${treeSitterCli} generate`, { cwd: parserDir }, onData);
        if (buildResult.status === "err") {
            const cliMsg =
                buildResult.result[0].name +
                ": " +
                buildResult.result[0].message.replace(/\n/g, " > ") +
                (buildResult.result[1].length > 1 ? ` Logs: ${buildResult.result[1].join(">")}` : "");

            logger.appendLine(`Failed to build parser using tree-sitter cli > ${cliMsg}`);
            return err(`Failed to build parser using tree-sitter cli > ${cliMsg}`);
        }
    } else {
        const cliMsg =
            treeSitterCliOk.result[0].name +
            ": " +
            treeSitterCliOk.result[0].message.replace(/\n/g, " > ") +
            (treeSitterCliOk.result[1].length > 1 ? ` Logs: ${treeSitterCliOk.result[1].join(">")}` : "");

        logger.appendLine(
            `Parser '${parserName}' requires local build, but tree-sitter cli command '${treeSitterCli} --version' failed: ${cliMsg}`
        );
        return err(
            `
            Parser '${parserName}' requires local build, but 
            tree-sitter cli command '${treeSitterCli} --version' failed: ${cliMsg}.
            `
        );
    }

    loadResult = await loadParser(parsersDir, parserName, subdirectory);
    if (loadResult.status === "err") {
        logger.appendLine(`Failed to load parser after building it > ${loadResult.result}`);
        return err(`Failed to load parser after building it > ${loadResult.result}`);
    }

    // try to set language
    try {
        const parser = new Parser();

        parser.setLanguage(loadResult.result);
    } catch (error) {
        logger.appendLine(`Failed to set language after building it > ${JSON.stringify(error)}`);
        return err(`Failed to set language after building it > ${JSON.stringify(error)}`);
    }

    return ok(loadResult.result);
}

async function runCmd(
    cmd: string,
    options: ExecOptions = {},
    onData?: (data: string) => void
): Promise<Result<string, [ExecException, string[]]>> {
    getLogger().appendLine(`Running command: '${cmd}'`);

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
    languageId: string,
    autoInstall = false
): Promise<Result<Language | undefined, string>> {
    const ignoredLanguageIds = configuration.getIgnoredLanguageIds();
    if (ignoredLanguageIds.includes(languageId)) {
        return ok(undefined);
    }

    const { npmPackageName, parserName, subdirectory } = configuration.getLanguageConfig(languageId);
    const parserPackagePath = getAbsoluteParserDir(parsersDir, parserName);

    const npm = "npm";
    const treeSitterCli = configuration.getTreeSitterCliPath();

    await parserFinishedInit;

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
            } else {
                void vscode.window.showInformationMessage(
                    `Failed to add language '${languageId}' to the ignore list > ${result.result}`
                );
            }

            return ok(undefined);
        }

        if (doInstall !== "Yes") {
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
                return await installParser(
                    parsersDir,
                    npmPackageName,
                    parserName,
                    npm,
                    treeSitterCli,
                    subdirectory,
                    (data) => progress.report({ message: data, increment: number++ })
                );
            }
        );

        if (downloadResult.status === "err") {
            return err(
                `Failed to download/build parser for language ${languageId} > ${downloadResult.result}`
            );
        }
    }

    const loadResult = await loadParser(parsersDir, parserName, subdirectory);
    switch (loadResult.status) {
        case "err":
            getLogger().appendLine(`Failed to load parser for language ${languageId} > ${loadResult.result}`);
            return err(`Failed to load parser for language ${languageId} > ${loadResult.result}`);

        case "ok":
            return ok(loadResult.result);
    }
}

import * as codeBlocksCliClient from "./codeBlocksWrapper/codeBlocksCliClient";
import * as fs from "fs";
import * as vscode from "vscode";
import {
  GetSubtreesArgs, GetSubtreesResponse,
  InstallLanguageArgs,
  InstallLanguageResponse,
  MoveBlockArgs,
  MoveBlockResponse,
} from "./codeBlocksWrapper/types";
import { getOrInstallCli } from "./codeBlocksWrapper/installer/installer";
import { join } from "path";

export type LanguageSupport = {
  parserInstaller: {
    downloadCmd: string;
    libraryName: string;
    languageFnSymbol: string;
  };
  queries: string[];
};

export type CodeBlocksExtensionSettings = {
  languageSupport: Map<string, LanguageSupport>;
  codeBlocksCliPath: string | undefined;
};

export async function cachedInstallLanguage(
  codeBlocksCliPath: string,
  args: InstallLanguageArgs,
): Promise<InstallLanguageResponse | undefined> {
  const cachedResultFile = join(args.installDir, "codeBlocksCachedResult.json");
  if (fs.existsSync(cachedResultFile)) {
    const cachedResultContent: Buffer = await fs.promises.readFile(cachedResultFile);
    const cachedResult = JSON.parse(cachedResultContent.toString()) as InstallLanguageResponse;

    return cachedResult;
  }

  const result = await installLanguage(codeBlocksCliPath, args);
  await fs.promises.writeFile(cachedResultFile, JSON.stringify(result));

  return result;
}

export async function installLanguage(
  codeBlocksCliPath: string,
  args: InstallLanguageArgs,
): Promise<InstallLanguageResponse | undefined> {
  console.log(`Install language args: ${JSON.stringify(args)}`);

  const response = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: `Installing ${args.libraryName}`,
    },
    async (progress) =>
      await codeBlocksCliClient.installLanguage(codeBlocksCliPath, args, (installationProgress) =>
        progress.report({
          increment: 5,
          message: installationProgress,
        })
      )
  );

  switch (response.status) {
    case "ok":
      return response.result;

    case "error":
      await vscode.window.showErrorMessage(`Failed to install language: ${response.result}`);
      break;
  }
}

export async function getBlocks(
  codeBlocksCliPath: string,
  args: GetSubtreesArgs,
): Promise<GetSubtreesResponse | undefined> {
  console.log(`Get subtrees args: ${JSON.stringify(args).substring(0, 200)}`);

  const response = await codeBlocksCliClient.getSubtrees(codeBlocksCliPath, args);

  switch (response.status) {
    case "ok":
      return response.result;

    case "error":
      await vscode.window.showErrorMessage(`Failed to get blocks: ${response.result}`);
      return undefined;
  }
}

export async function moveBlock(
  codeBlocksCliPath: string,
  args: MoveBlockArgs,
  allowRetry = true,
): Promise<MoveBlockResponse | undefined> {
  console.log(`Move block args: ${JSON.stringify(args).substring(0, 200)}`);

  const response = await codeBlocksCliClient.moveBlock(codeBlocksCliPath, args);
  const differentScopeErrorMsg =
    "Illegal move operation\n\nCaused by:\n    Can't move block to different scope";

  switch (response.status) {
    case "ok": {
      const moveBlockResponse = response.result;

      return moveBlockResponse;
    }

    case "error": {
      const options: "Try force"[] = [];
      if (response.result === differentScopeErrorMsg && !args.force && allowRetry) {
        options.push("Try force");

        const choice = await vscode.window.showErrorMessage(
          `Failed to move block: ${response.result}`,
          ...options
        );

        if (choice === "Try force") {
          args.force = true;
          return await moveBlock(codeBlocksCliPath, args);
        } else {
          return undefined;
        }
      } else if (response.result !== differentScopeErrorMsg) {
        await vscode.window.showErrorMessage(`Failed to move block: ${response.result}`);
      }
    }
  }
}

export async function getCodeBlocksCliPath(binDir: string): Promise<string | undefined> {
  const codeBlocksCliPath: string | undefined | null = vscode.workspace
    .getConfiguration("codeBlocks")
    .get("binPath");

  if (codeBlocksCliPath === null || codeBlocksCliPath === undefined || codeBlocksCliPath.length === 0) {
    return await getOrInstallCli(binDir);
  } else {
    return codeBlocksCliPath;
  }

}

export function getLanguageSupport(languageId: string): LanguageSupport | undefined {
  const languageSupportConfig: Record<string, LanguageSupport> | undefined | null = vscode.workspace
    .getConfiguration("codeBlocks")
    .get("languageSupport");

  if (languageSupportConfig === null || languageSupportConfig === undefined) {
    return undefined;
  }

  if (languageId in languageSupportConfig) {
    return languageSupportConfig[languageId];
  } else {
    return undefined;
  }
}

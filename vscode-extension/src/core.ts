import * as codeBlocksCliClient from "./codeBlocksWrapper/codeBlocksCliClient";
import * as vscode from "vscode";
import {
  GetSubtreesArgs, GetSubtreesResponse,
  InstallLanguageArgs,
  InstallLanguageResponse,
  MoveBlockArgs,
  MoveBlockResponse,
} from "./codeBlocksWrapper/types";
import { getOrInstallCli } from "./codeBlocksWrapper/installer/installer";

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

export async function installLanguage(
  binDir: string,
  args: InstallLanguageArgs,
): Promise<InstallLanguageResponse | undefined> {
  console.log(`Install language args: ${JSON.stringify(args)}`);

  const codeBlocksCliPath = await getCodeBlocksCliPath(binDir);
  if (codeBlocksCliPath === undefined) {
    return undefined;
  }

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
  binDir: string,
  args: GetSubtreesArgs,
): Promise<GetSubtreesResponse | undefined> {
  const codeBlocksCliPath = await getCodeBlocksCliPath(binDir);
  if (codeBlocksCliPath === undefined) {
    return undefined;
  }

  console.log(`Get subtrees args: ${JSON.stringify(args)}`);

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
  binDir: string,
  document: vscode.TextDocument,
  args: MoveBlockArgs,
): Promise<MoveBlockResponse | undefined> {
  console.log(`Move block args: ${JSON.stringify(args)}`);

  const codeBlocksCliPath = await getCodeBlocksCliPath(binDir);
  if (codeBlocksCliPath === undefined) {
    return undefined;
  }

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
      if (response.result === differentScopeErrorMsg && !args.force) {
        options.push("Try force");
      }

      const choice = await vscode.window.showErrorMessage(
        `Failed to move block: ${response.result}`,
        ...options
      );

      if (choice === "Try force") {
        args.force = true;
        await moveBlock(binDir, document, args);
      }

      break;
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

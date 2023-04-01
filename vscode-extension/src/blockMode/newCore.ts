import * as codeBlocksCliClient from "../codeBlocks/codeBlocksCliClient";
import * as vscode from "vscode";
import {
  GetSubtreesArgs, GetSubtreesResponse,
  InstallLanguageArgs,
  InstallLanguageResponse,
  MoveBlockArgs,
} from "../codeBlocks/types";
import { getOrInstallCli } from "../codeBlocks/installer/installer";
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

export async function installLanguage(
  args: InstallLanguageArgs,
  binDir: string,
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
  text: string,
  binDir: string,
  languageSupport: LanguageSupport,
  libraryPath: string,
): Promise<GetSubtreesResponse | undefined> {
  const codeBlocksCliPath = await getCodeBlocksCliPath(binDir);
  if (codeBlocksCliPath === undefined) {
    return undefined;
  }

  const args: GetSubtreesArgs = {
    queries: languageSupport.queries,
    languageFnSymbol: languageSupport.parserInstaller.languageFnSymbol,
    libraryPath: libraryPath,
    text: text
  };

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
  document: vscode.TextDocument,
  moveArgs: MoveBlockArgs,
  binDir: string,
): Promise<void> {
  const codeBlocksCliPath = await getCodeBlocksCliPath(binDir);
  if (codeBlocksCliPath === undefined) {
    return undefined;
  }

  const response = await codeBlocksCliClient.moveBlock(codeBlocksCliPath, moveArgs);
  const differentScopeErrorMsg =
    "Illegal move operation\n\nCaused by:\n    Can't move block to different scope";

  switch (response.status) {
    case "ok": {
      const newContent = response.result;

      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newContent);

      await vscode.workspace.applyEdit(edit);
      break;
    }

    case "error": {
      const options: "Try force"[] = [];
      if (response.result === differentScopeErrorMsg && !moveArgs.force) {
        options.push("Try force");
      }

      const choice = await vscode.window.showErrorMessage(
        `Failed to move block: ${response.result}`,
        ...options
      );

      if (choice === "Try force") {
        moveArgs.force = true;
        await moveBlock(document, moveArgs, binDir);
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

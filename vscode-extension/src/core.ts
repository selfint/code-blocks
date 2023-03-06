import * as codeBlocksCliClient from "./codeBlocks/codeBlocksCliClient";
import * as vscode from "vscode";
import {
  GetSubtreesArgs,
  InstallLanguageArgs,
  InstallLanguageResponse,
  MoveBlockArgs,
} from "./codeBlocks/types";
import { UpdateMessage } from "./messages";

export async function installLanguage(
  codeBlocksCliPath: string,
  args: InstallLanguageArgs
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

export async function drawBlocks(
  codeBlocksCliPath: string,
  webview: vscode.Webview,
  args: GetSubtreesArgs
): Promise<void> {
  console.log(`Get subtrees args: ${JSON.stringify(args)}`);

  const response = await codeBlocksCliClient.getSubtrees(codeBlocksCliPath, args);

  switch (response.status) {
    case "ok":
      await webview.postMessage({
        type: "update",
        text: args.text,
        blockTrees: response.result,
      } as UpdateMessage);
      break;

    case "error":
      await vscode.window.showErrorMessage(`Failed to get blocks: ${response.result}`);
      break;
  }
}

export async function moveBlock(
  codeBlocksCliPath: string,
  document: vscode.TextDocument,
  moveArgs: MoveBlockArgs
): Promise<void> {
  const response = await codeBlocksCliClient.moveBlock(codeBlocksCliPath, moveArgs);
  const specialErrorMsg = "Illegal move operation\n\nCaused by:\n    Can't move block to different scope";

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
      if (response.result === specialErrorMsg && !moveArgs.force) {
        options.push("Try force");
      }

      console.log(response.result);
      console.log(specialErrorMsg);
      console.log(response.result === specialErrorMsg);

      const choice = await vscode.window.showErrorMessage(
        `Failed to move block: ${response.result}`,
        ...options
      );

      if (choice === "Try force") {
        moveArgs.force = true;
        await moveBlock(codeBlocksCliPath, document, moveArgs);
      }

      break;
    }
  }
}

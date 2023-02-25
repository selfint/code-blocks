import * as vscode from "vscode";
import * as codeBlocksCliClient from "./codeBlocks/codeBlocksCliClient";
import {
  GetSubtreesArgs,
  GetSubtreesResponse,
  JsonResult,
  MoveBlockArgs,
  MoveBlockResponse,
  SupportedLanguage,
} from "./codeBlocks/types";
import { getQueryStrings } from "./codeBlocks/queries";
import { MoveCommand, UpdateMessage } from "./messages";

export async function updateUiBlocks(
  document: vscode.TextDocument,
  webviewPanel: vscode.WebviewPanel,
  docLang: SupportedLanguage,
  codeBlocksCliBinPath: string
): Promise<void> {
  const text = document.getText();
  const getSubtreeArgs: GetSubtreesArgs = {
    text: text,
    queries: getQueryStrings(docLang),
    language: docLang,
  };

  let response: JsonResult<GetSubtreesResponse>;

  try {
    response = await codeBlocksCliClient.getSubtrees(codeBlocksCliBinPath, getSubtreeArgs);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to get blocks: ${JSON.stringify(error)}`);
    return;
  }

  switch (response.status) {
    case "ok":
      webviewPanel.webview.postMessage({
        type: "update",
        text: text,
        blockTrees: response.result,
      } as UpdateMessage);
      break;

    case "error":
      vscode.window.showErrorMessage(`Failed to get blocks: ${response.result}`);
      break;
  }
}

export async function moveBlock(
  msg: MoveCommand,
  document: vscode.TextDocument,
  docLang: SupportedLanguage,
  codeBlocksCliBinPath: string
): Promise<void> {
  const moveArgs: MoveBlockArgs = {
    text: document.getText(),
    srcBlock: msg.args.src,
    dstBlock: msg.args.dst,
    queries: getQueryStrings(docLang),
    language: docLang,
  };

  let response: JsonResult<MoveBlockResponse>;

  try {
    response = await codeBlocksCliClient.moveBlock(codeBlocksCliBinPath, moveArgs);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to move block: ${JSON.stringify(error)}`);
    return;
  }

  switch (response.status) {
    case "ok":
      const newContent = response.result;

      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newContent);

      await vscode.workspace.applyEdit(edit);
      break;

    case "error":
      vscode.window.showErrorMessage(`Failed to move block: ${response.result}`);
      break;
  }
}

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
import { MoveCommand, UpdateMessage } from "./messages";

export async function drawBlocks(
  codeBlocksCliPath: string,
  webview: vscode.Webview,
  document: vscode.TextDocument,
  docLang: SupportedLanguage,
  queries: string[]
): Promise<void> {
  const text = document.getText();
  const getSubtreeArgs: GetSubtreesArgs = {
    text: text,
    queries: queries,
    language: docLang,
  };

  console.log(`Get subtrees args: ${JSON.stringify(getSubtreeArgs.language)}`);

  let response: JsonResult<GetSubtreesResponse>;

  try {
    response = await codeBlocksCliClient.getSubtrees(codeBlocksCliPath, getSubtreeArgs);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to get blocks: ${JSON.stringify(error)}`);
    return;
  }

  switch (response.status) {
    case "ok":
      webview.postMessage({
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
  codeBlocksCliPath: string,
  document: vscode.TextDocument,
  docLang: SupportedLanguage,
  queries: string[]
): Promise<void> {
  const moveArgs: MoveBlockArgs = {
    text: document.getText(),
    srcBlock: msg.args.src,
    dstBlock: msg.args.dst,
    queries: queries,
    language: docLang,
  };

  let response: JsonResult<MoveBlockResponse>;

  try {
    response = await codeBlocksCliClient.moveBlock(codeBlocksCliPath, moveArgs);
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

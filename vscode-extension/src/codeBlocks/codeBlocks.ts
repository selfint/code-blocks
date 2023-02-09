import axios from "axios";
import { ChildProcess, exec } from "child_process";
import { GetSubtreesArgs, MoveItemArgs, MoveItemResponse, GetSubtreesResponse } from "./types";
import * as vscode from "vscode";

const GET_SUBTREES_ENDPOINT = "http://localhost:8000/get_subtrees";
const MOVE_ITEM_ENDPOINT = "http://localhost:8000/move_item";

export class CodeBlocksServerRC {
  private static instances: number = 0;
  private static server: ChildProcess | undefined = undefined;

  private constructor() {}

  public static startServer() {
    if (this.instances === 0) {
      CodeBlocksServerRC._startServer();
    }

    this.instances++;
    console.log(`Start called, now instances=${this.instances}`);
  }

  public static stopServer() {
    if (this.instances === 1) {
      CodeBlocksServerRC._stopServer();
      this.server = undefined;
      this.instances = 0;
    } else if (this.instances > 1) {
      this.instances -= 1;
    } else {
      console.error(`UNREACHABLE: CodeBlocksServerRC instances=${this.instances}`);
    }

    console.log(`Stop called, now instances=${this.instances}`);
  }

  private static _startServer() {
    this.server = exec("code-blocks-server", (err, stderr, stdout) => {
      if (err) {
        console.error(`CodeBlocksServerRC error: ${err}`);
      }

      if (stdout.length > 0) {
        console.log(`code-blocks-server stdout: ${stdout}`);
      }

      if (stderr.length > 0) {
        console.error(`code-blocks-server stderr: ${stdout}`);
        if (!stderr.includes("SIGTERM")) {
          vscode.window.showErrorMessage(`Got error from code-blocks-server: ${stderr}`);
        }
        vscode.window.showErrorMessage(`Got error from code-blocks-server: ${stderr}`);
      }
    });

    console.log("Started server");
  }

  private static _stopServer() {
    if (this.server === undefined) {
      console.warn("Tried to stop undefined server");
    } else {
      this.server.kill();
      console.log("Killed server");
    }
  }
}

export async function getBlockTrees(args: GetSubtreesArgs): Promise<GetSubtreesResponse> {
  if (args.language === "typescriptreact") {
    args.language = "tsx";
  }

  const response = await axios({
    url: GET_SUBTREES_ENDPOINT,
    method: "POST",
    data: args,
  });

  return response.data;
}

export async function moveBlock(args: MoveItemArgs): Promise<MoveItemResponse> {
  if (args.language === "typescriptreact") {
    args.language = "tsx";
  }

  const response = await axios({
    url: MOVE_ITEM_ENDPOINT,
    method: "POST",
    data: args,
  });

  return response.data;
}

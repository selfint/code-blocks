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
      console.log("Started server");
      this.server = exec("code-blocks-server", (err, stderr, stdout) => {
        if (stderr.length > 0) {
          if (!stderr.includes("SIGTERM")) {
            vscode.window.showErrorMessage(`Got error from code-blocks-server: ${stderr}`);
          }
          vscode.window.showErrorMessage(`Got error from code-blocks-server: ${stderr}`);
        }
      });
    }

    this.instances++;
    console.log(`Start called, now instances=${this.instances}`);
  }

  public static stopServer() {
    if (this.instances === 1) {
      this.server?.kill();
      console.log("Killed server");
      this.server = undefined;
      this.instances = 0;
    } else if (this.instances > 1) {
      this.instances -= 1;
    } else {
      console.error(`UNREACHABLE: CodeBlocksServerRC instances < 0 (instances=${this.instances})`);
    }
    console.log(`Stop called, now instances=${this.instances}`);
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

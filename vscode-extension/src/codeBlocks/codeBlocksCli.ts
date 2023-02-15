import { spawn } from "child_process";
import { GetSubtreesArgs, MoveBlockArgs, MoveBlockResponse, GetSubtreesResponse, JsonResult } from "./types";
import { createInterface } from "readline";

type MethodCall =
  | {
      method: "getSubtrees";
      params: GetSubtreesArgs;
    }
  | {
      method: "moveBlock";
      params: MoveBlockArgs;
    };

export async function getBlockTrees(
  bin: string,
  args: GetSubtreesArgs
): Promise<JsonResult<GetSubtreesResponse>> {
  return new Promise(async (resolve, reject) => {
    const cli = spawn(bin);
    const rl = createInterface(cli.stdout);

    rl.on("line", (line) => {
      const parsed = JSON.parse(line);
      if (parsed !== undefined) {
        resolve(parsed);
      } else {
        reject(`Failed to parse line: ${line}`);
      }
    });

    const methodCall: MethodCall = {
      method: "getSubtrees",
      params: args,
    };

    cli.stdin.write(JSON.stringify(methodCall) + "\n");
  });
}

export async function moveBlock(bin: string, args: MoveBlockArgs): Promise<JsonResult<MoveBlockResponse>> {
  return new Promise(async (resolve, reject) => {
    const cli = spawn(bin);
    const rl = createInterface(cli.stdout);

    rl.on("line", (line) => {
      const parsed = JSON.parse(line);
      if (parsed !== undefined) {
        resolve(parsed);
      } else {
        reject(`Failed to parse line: ${line}`);
      }
    });

    const methodCall: MethodCall = {
      method: "moveBlock",
      params: args,
    };

    cli.stdin.write(JSON.stringify(methodCall) + "\n");
  });
}

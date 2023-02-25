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

async function passInputToBinAndGetNextLine(bin: string, input: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const cli = spawn(bin);
      const rl = createInterface(cli.stdout);

      rl.on("line", (line) => {
        resolve(line);
      });

      cli.stdin.write(input + "\n");
    } catch (e) {
      reject(e);
    }
  });
}

export async function getBlockTrees(
  bin: string,
  args: GetSubtreesArgs
): Promise<JsonResult<GetSubtreesResponse>> {
  const methodCall: MethodCall = {
    method: "getSubtrees",
    params: args,
  };

  const response = await passInputToBinAndGetNextLine(bin, JSON.stringify(methodCall));
  const parsedResponse = JSON.parse(response);

  if (parsedResponse !== undefined) {
    return parsedResponse;
  } else {
    throw new Error(`Failed to parse response: ${response}`);
  }
}

export async function moveBlock(bin: string, args: MoveBlockArgs): Promise<JsonResult<MoveBlockResponse>> {
  const methodCall: MethodCall = {
    method: "moveBlock",
    params: args,
  };

  const response = await passInputToBinAndGetNextLine(bin, JSON.stringify(methodCall));
  const parsedResponse = JSON.parse(response);

  if (parsedResponse !== undefined) {
    return parsedResponse;
  } else {
    throw new Error(`Failed to parse response: ${response}`);
  }
}

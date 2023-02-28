import {
  GetSubtreesArgs,
  GetSubtreesResponse,
  JsonResult,
  MethodCall,
  MoveBlockArgs,
  MoveBlockResponse,
} from "./types";
import { createInterface } from "readline";
import { spawn } from "child_process";

export async function getSubtrees(
  bin: string,
  args: GetSubtreesArgs
): Promise<JsonResult<GetSubtreesResponse>> {
  return await callCodeBlocksCli<GetSubtreesResponse>(bin, { method: "getSubtrees", params: args });
}

export async function moveBlock(bin: string, args: MoveBlockArgs): Promise<JsonResult<MoveBlockResponse>> {
  return await callCodeBlocksCli<MoveBlockResponse>(bin, { method: "moveBlock", params: args });
}

async function callCodeBlocksCli<Response>(
  codeBlocksCliPath: string,
  methodCall: MethodCall
): Promise<JsonResult<Response>> {
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

  const response = await passInputToBinAndGetNextLine(codeBlocksCliPath, JSON.stringify(methodCall));
  const parsedResponse = JSON.parse(response);

  if (parsedResponse !== undefined) {
    return parsedResponse;
  } else {
    throw new Error(`Failed to parse response: ${response}`);
  }
}

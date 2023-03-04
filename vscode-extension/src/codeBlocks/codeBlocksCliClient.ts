import {
  CliRequest,
  GetSubtreesArgs,
  GetSubtreesResponse,
  InstallLanguageArgs,
  InstallLanguageResponse,
  JsonResult,
  MoveBlockArgs,
  MoveBlockResponse,
} from "./types";
import { createInterface } from "readline";
import { spawn } from "child_process";

export async function installLanguage(
  bin: string,
  args: InstallLanguageArgs,
  progressHandler?: (progress: string) => void
): Promise<Exclude<JsonResult<InstallLanguageResponse>, { status: "progress" }>> {
  return await callCodeBlocksCli<InstallLanguageResponse>(
    bin,
    { method: "installLanguage", params: args },
    progressHandler
  );
}

export async function getSubtrees(
  bin: string,
  args: GetSubtreesArgs
): Promise<Exclude<JsonResult<GetSubtreesResponse>, { status: "progress" }>> {
  return await callCodeBlocksCli<GetSubtreesResponse>(bin, { method: "getSubtrees", params: args });
}

export async function moveBlock(
  bin: string,
  args: MoveBlockArgs
): Promise<Exclude<JsonResult<MoveBlockResponse>, { status: "progress" }>> {
  return await callCodeBlocksCli<MoveBlockResponse>(bin, { method: "moveBlock", params: args });
}

async function callCodeBlocksCli<Response>(
  codeBlocksCliPath: string,
  methodCall: CliRequest,
  progressHandler?: (progress: string) => void
): Promise<Exclude<JsonResult<Response>, { status: "progress" }>> {
  async function passInputToBinAndGetNextLine(
    bin: string,
    input: string
  ): Promise<Exclude<JsonResult<Response>, { status: "progress" }>> {
    return new Promise((resolve, reject) => {
      try {
        const cli = spawn(bin);
        const rl = createInterface(cli.stdout);

        rl.on("line", (line) => {
          console.log(`Got line: ${line}`);
          try {
            const parsedLine = JSON.parse(line) as JsonResult<Response> | undefined;
            if (parsedLine === undefined) {
              reject(`failed to parse line: ${line}`);
            } else if (parsedLine.status === "progress") {
              if (progressHandler !== undefined) {
                progressHandler(parsedLine.result);
              }
            } else {
              resolve(parsedLine);
            }
          } catch (e) {
            reject(e);
          }
        });

        cli.stdin.write(input + "\n");
      } catch (e) {
        reject(e);
      }
    });
  }

  return await passInputToBinAndGetNextLine(codeBlocksCliPath, JSON.stringify(methodCall));
}

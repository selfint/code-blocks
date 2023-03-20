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

type JsonResponse<T> = Exclude<JsonResult<T>, { status: "progress" }>;

export async function installLanguage(
  bin: string,
  args: InstallLanguageArgs,
  progressHandler?: (progress: string) => void
): Promise<JsonResponse<InstallLanguageResponse>> {
  return await callCodeBlocksCli<InstallLanguageResponse>(
    bin,
    { method: "installLanguage", params: args },
    progressHandler
  );
}

export async function getSubtrees(
  bin: string,
  args: GetSubtreesArgs
): Promise<JsonResponse<GetSubtreesResponse>> {
  return await callCodeBlocksCli<GetSubtreesResponse>(bin, { method: "getSubtrees", params: args });
}

export async function moveBlock(bin: string, args: MoveBlockArgs): Promise<JsonResponse<MoveBlockResponse>> {
  return await callCodeBlocksCli<MoveBlockResponse>(bin, { method: "moveBlock", params: args });
}

async function callCodeBlocksCli<Response>(
  codeBlocksCliPath: string,
  methodCall: CliRequest,
  progressHandler?: (progress: string) => void
): Promise<JsonResponse<Response>> {
  const cli = spawn(codeBlocksCliPath);

  try {
    return await new Promise<JsonResponse<Response>>((resolve, reject) => {
      cli.on("error", (err) => {
        console.log(`Got err: ${JSON.stringify(err)}`);
        reject(err);
      });
      const rl = createInterface(cli.stdout);

      rl.on("line", (line) => {
        console.log(`Got line: ${line}`);
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
      });

      cli.stdin.write(JSON.stringify(methodCall) + "\n");
    });
  } catch (err) {
    return {
      status: "error",
      result: `Internal error: ${JSON.stringify(err)}`,
    };
  } finally {
    cli.kill();
  }
}

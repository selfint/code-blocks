import * as vscode from "vscode";
import * as os from "os";

const RELEASE_URL = "https://github.com/selfint/code-blocks/releases/download/code-blocks-server-v0.2.0/";

export type SupportedTriple =
  | "x86_64-unknown-linux-gnu"
  | "x86_64-apple-darwin"
  | "aarch64-apple-darwin"
  | "x86_64-pc-windows-msvc";

export type PlatfromInfo = {
  triple: SupportedTriple;
  ext: string | undefined;
};

export const supportedPlatforms = new Map<string, PlatfromInfo>([
  ["linux-x86_64", { triple: "x86_64-unknown-linux-gnu", ext: undefined }],
  ["darwin-x86_64", { triple: "x86_64-apple-darwin", ext: undefined }],
  ["darwin-arm64", { triple: "aarch64-apple-darwin", ext: undefined }],
  ["win32-x86_64", { triple: "x86_64-pc-windows-msvc", ext: ".exe" }],
]);

export function getPlatfromBinaryUri(): vscode.Uri | undefined {
  const platform = os.platform();
  const arch = os.arch();
  console.log(`Got platform: ${platform} arch: ${arch}`);

  const info = supportedPlatforms.get(`${platform}-${arch}`);

  if (info === undefined) {
    return undefined;
  }

  let url = RELEASE_URL + info.triple + "-code-blocks-cli";
  if (info.ext !== undefined) {
    url += info.ext;
  }

  const uri = vscode.Uri.parse(url);
  console.log(`Platform binary release uri: ${uri}`);

  return uri;
}

export function platformIsSupported(): boolean {
  const platform = os.platform();
  const arch = os.arch();
  console.log(`Got platform: ${platform} arch: ${arch}`);

  return supportedPlatforms.has(`${platform}-${arch}`);
}

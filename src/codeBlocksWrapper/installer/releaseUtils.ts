import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { promises as asyncFs } from "fs";
import { download } from "./lldb_vscode_copy/lldb_vscode_installer_utils";

const RELEASE_URL = `https://github.com/selfint/code-blocks/releases/download/code-blocks-server-v0.6.0/`;

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

export function getPlatform(): string {
  const platform = os.platform();
  let arch = os.arch();
  console.log(`Got platform: ${platform} arch: ${arch}`);
  if (arch === "x64") {
    arch = "x86_64";
    console.log(`Overwrote arch: ${arch}`);
  }

  return `${platform}-${arch}`;
}

export function getPlatfromBinaryUri(): vscode.Uri | undefined {
  const platform = getPlatform();
  const info = supportedPlatforms.get(platform);

  if (info === undefined) {
    return undefined;
  }

  let url = RELEASE_URL + info.triple + "-code-blocks-cli";
  if (info.ext !== undefined) {
    url += info.ext;
  }

  const uri = vscode.Uri.parse(url);
  console.log(`Platform binary release uri: ${uri.toString()}`);

  return uri;
}

export function platformIsSupported(): boolean {
  const platform = getPlatform();
  console.log(`Got platform: ${platform}`);

  return supportedPlatforms.has(platform);
}

export async function installViaRelease(
  binary: string,
  extensionBinDirPath: string,
  permissions: number
): Promise<boolean> {
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: "Downloading code-blocks-cli from release",
    },
    async (progress) => {
      let lastPercentage = 0;
      const reportProgress = (downloaded: number, contentLength: number): void => {
        const percentage = Math.round((downloaded / contentLength) * 100);
        progress.report({
          message: `${percentage}%`,
          increment: percentage - lastPercentage,
        });
        lastPercentage = percentage;
      };

      const downloadTarget = path.join(os.tmpdir(), binary);
      const uri = getPlatfromBinaryUri();
      if (uri === undefined) {
        await vscode.window.showErrorMessage(`Unsupported os/arch: ${getPlatform()}`);
        return false;
      }

      try {
        await download(uri, downloadTarget, reportProgress);
      } catch (e) {
        await vscode.window.showErrorMessage(JSON.stringify(e));
        return false;
      }

      progress.report({
        message: "installing",
        increment: 100 - lastPercentage,
      });

      await asyncFs.mkdir(extensionBinDirPath, { recursive: true });
      const finalPath = path.join(extensionBinDirPath, binary);

      await asyncFs.copyFile(downloadTarget, finalPath);
      await asyncFs.unlink(downloadTarget);
      await asyncFs.chmod(finalPath, permissions);

      console.log(`Installed ${binary} to ${finalPath}`);

      return true;
    }
  );
}

import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { promises as asyncFs } from "fs";
import { download } from "./lldb_vscode_copy/lldb_vscode_installer_utils";
import * as releaseUtils from "./releaseUtils";

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

export async function installViaRelease(
  extensionBinDirPath: string,
  bin: string,
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
      let reportProgress = (downloaded: number, contentLength: number): void => {
        let percentage = Math.round((downloaded / contentLength) * 100);
        progress.report({
          message: `${percentage}%`,
          increment: percentage - lastPercentage,
        });
        lastPercentage = percentage;
      };

      let downloadTarget = path.join(os.tmpdir(), "code-blocks-cli");
      const uri = releaseUtils.getPlatfromBinaryUri();
      if (uri === undefined) {
        vscode.window.showErrorMessage(`Unsupported os/arch: ${os.platform()}-${os.arch()}`);
        return false;
      }

      try {
        await download(uri, downloadTarget, reportProgress);
      } catch (e) {
        vscode.window.showErrorMessage(JSON.stringify(e));
        return false;
      }

      progress.report({
        message: "installing",
        increment: 100 - lastPercentage,
      });

      await asyncFs.mkdir(path.join(extensionBinDirPath));
      const finalPath = path.join(extensionBinDirPath, bin);

      await asyncFs.copyFile(downloadTarget, finalPath);
      await asyncFs.unlink(downloadTarget);
      await asyncFs.chmod(finalPath, permissions);

      console.log(`Installed ${bin} to ${finalPath}`);

      return true;
    }
  );
}

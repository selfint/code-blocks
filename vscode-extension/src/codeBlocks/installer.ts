import { exec, spawn } from "child_process";
import * as vscode from "vscode";
import which from "which";
import * as os from "os";
import * as path from "path";
import { download } from "../installer/lldb_vscode_copy/lldb_vscode_installer_utils";

const BINARY = "code-blocks-cli";
const CARGO_INSTALL_CMD = "cargo install code-blocks-server --features=cli";
const RELEASE_URL = "https://github.com/selfint/code-blocks/releases/download/code-blocks-server-v0.2.0/";

export async function ensureInstalled(): Promise<boolean> {
  const installed = which.sync(BINARY, { nothrow: true });

  if (installed !== null) {
    return true;
  }

  let options = [];
  if (getSupportedPlatform() !== undefined) {
    options.push("Install from release");
  }

  if (which.sync("cargo", { nothrow: true }) !== null) {
    options.push("Install with cargo");
  }

  //@ts-expect-error
  const selected: "Install from release" | "Install with cargo" | undefined =
    await vscode.window.showErrorMessage(`${BINARY} is not in PATH`, ...options);

  switch (selected) {
    case undefined:
      return false;

    case "Install from release":
      return await installViaRelease();

    case "Install with cargo":
      return await installViaCargo();
  }
}

type SupportedTriple =
  | "x86_64-unknown-linux-gnu"
  | "x86_64-apple-darwin"
  | "aarch64-apple-darwin"
  | "x86_64-pc-windows-msvc";

type PlatfromInfo = {
  triple: SupportedTriple;
  suffix: string | undefined;
};

const supportedPlatforms = new Map<string, PlatfromInfo>([
  ["linux-x86_64", { triple: "x86_64-unknown-linux-gnu", suffix: undefined }],
  ["darwin-x86_64", { triple: "x86_64-apple-darwin", suffix: undefined }],
  ["darwin-arm64", { triple: "aarch64-apple-darwin", suffix: undefined }],
  ["win32-x86_64", { triple: "x86_64-pc-windows-msvc", suffix: ".exe" }],
]);

function getPlatfromBinaryUrl(): vscode.Uri | undefined {
  const info = getSupportedPlatform();
  if (info === undefined) {
    return undefined;
  }

  let url = RELEASE_URL + info.triple + "-code-blocks-cli";
  if (info.suffix !== undefined) {
    url += info.suffix;
  }

  const uri = vscode.Uri.parse(url);
  console.log(url);
  console.log(uri);

  return uri;
}

function getSupportedPlatform(): PlatfromInfo | undefined {
  const platform = os.platform();
  const arch = os.arch();
  console.log(`Got platform: ${platform} arch: ${arch}`);

  return supportedPlatforms.get(`${platform}-${arch}`);
}

async function installViaRelease(): Promise<boolean> {
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: "Downloading code-blocks-cli from release",
    },
    async (progress) => {
      let lastPercentage = 0;
      let reportProgress = (downloaded: number, contentLength: number) => {
        let percentage = Math.round((downloaded / contentLength) * 100);
        progress.report({
          message: `${percentage}%`,
          increment: percentage - lastPercentage,
        });
        lastPercentage = percentage;
      };

      let downloadTarget = path.join(os.tmpdir(), `code-blocks-cli`);
      const uri = getPlatfromBinaryUrl();
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

      await vscode.window.showInformationMessage(
        `code-blocks-cli downloaded to: ${downloadTarget} please add it to your PATH (and ensure it is executable), then press OK`,
        "OK"
      );

      return true;
    }
  );
}

async function installViaCargo(): Promise<boolean> {
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: "Downloading code-blocks-cli with cargo",
    },
    async (progress) => {
      const installed = await new Promise<boolean>((resolve, _) => {
        const cmd = exec(CARGO_INSTALL_CMD, (err, _, stderr) => {
          if (err !== null) {
            vscode.window.showErrorMessage(`Failed to install: ${err}`);
            resolve(false);
          } else if (!stderr.includes("Installed package")) {
            vscode.window.showErrorMessage(`Failed to install: ${stderr}`);
            resolve(false);
          }

          resolve(true);
        });

        cmd.stderr?.on("data", (data) => {
          console.log(data);
          progress.report({
            message: data,
          });
        });
      });

      return installed;
    }
  );
}

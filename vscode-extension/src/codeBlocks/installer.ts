import { exec } from "child_process";
import * as vscode from "vscode";
import which from "which";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { promises as asyncFs } from "fs";
import { download } from "../installer/lldb_vscode_copy/lldb_vscode_installer_utils";

const BINARY = "code-blocks-cli";
const CARGO_INSTALL_CMD = "cargo install code-blocks-server --features=cli";
const RELEASE_URL = "https://github.com/selfint/code-blocks/releases/download/code-blocks-server-v0.2.0/";

async function getInstallationPath(extensionPath: string): Promise<string | undefined> {
  async function ensureExecutable(binPath: string) {
    console.log(`ensuring ${binPath} executable`);
    await new Promise<void>((resolve, _) => {
      try {
        fs.access(binPath, 1, (err) => {
          if (err) {
            console.log(`path ${binPath} isn't executable, changing permissions`);
            fs.chmodSync(binPath, 0o755);
          }
          resolve();
        });
      } catch (e) {
        console.log(`Got exception: ${e}`);
      }
    });

    console.log(`checking now ${binPath} is executable`);
    fs.access(binPath, 1, (e) => {
      if (e) {
        console.error(`path ${binPath} isn't executable!`);
      } else {
        console.log(`path ${binPath} is executable`);
      }
    });
  }

  const inPath = which.sync(BINARY, { nothrow: true });

  const extensionBinPath = path.join(extensionPath, "bin", BINARY);
  const inExtensionBinDir = fs.existsSync(extensionBinPath);

  if (inExtensionBinDir) {
    await ensureExecutable(extensionBinPath);
    return extensionBinPath;
  } else if (inPath !== null) {
    return inPath;
  } else {
    return undefined;
  }
}

export async function ensureInstalled(extensionPath: string): Promise<string | undefined> {
  const installationPath = await getInstallationPath(extensionPath);
  if (installationPath !== undefined) {
    return installationPath;
  }

  type Selection = "Install from release" | "Install with cargo";
  let options: Selection[] = [];
  if (getSupportedPlatform() !== undefined) {
    options.push("Install from release");
  }

  if (which.sync("cargo", { nothrow: true }) !== null) {
    options.push("Install with cargo");
  }

  const selected = await vscode.window.showErrorMessage(`${BINARY} is not in PATH`, ...options);
  if (selected === undefined) {
    return undefined;
  }

  switch (selected) {
    case "Install from release":
      await installViaRelease(extensionPath);
      break;

    case "Install with cargo":
      await installViaCargo();
      break;
  }

  return await getInstallationPath(extensionPath);
}

type SupportedTriple =
  | "x86_64-unknown-linux-gnu"
  | "x86_64-apple-darwin"
  | "aarch64-apple-darwin"
  | "x86_64-pc-windows-msvc";

type PlatfromInfo = {
  triple: SupportedTriple;
  ext: string | undefined;
};

const supportedPlatforms = new Map<string, PlatfromInfo>([
  ["linux-x86_64", { triple: "x86_64-unknown-linux-gnu", ext: undefined }],
  ["darwin-x86_64", { triple: "x86_64-apple-darwin", ext: undefined }],
  ["darwin-arm64", { triple: "aarch64-apple-darwin", ext: undefined }],
  ["win32-x86_64", { triple: "x86_64-pc-windows-msvc", ext: ".exe" }],
]);

function getPlatfromBinaryUrl(): vscode.Uri | undefined {
  const info = getSupportedPlatform();
  if (info === undefined) {
    return undefined;
  }

  let url = RELEASE_URL + info.triple + "-code-blocks-cli";
  if (info.ext !== undefined) {
    url += info.ext;
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

async function installViaRelease(extensionPath: string): Promise<boolean> {
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

      let downloadTarget = path.join(os.tmpdir(), "code-blocks-cli");
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

      await asyncFs.mkdir(path.join(extensionPath, "bin"));
      const finalPath = path.join(extensionPath, "bin", BINARY);
      await asyncFs.copyFile(downloadTarget, finalPath);
      await asyncFs.unlink(downloadTarget);
      await asyncFs.chmod(finalPath, 0o7777);

      console.log(finalPath);

      return true;
    }
  );
}

async function installViaCargo(): Promise<void> {
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: "Installing code-blocks-cli with cargo",
    },
    async (progress) =>
      await new Promise<void>((resolve, _) => {
        const cmd = exec(CARGO_INSTALL_CMD, (err, _, stderr) => {
          if (err !== null) {
            vscode.window.showErrorMessage(`Failed to install: ${err}`);
          } else if (!stderr.includes("Installed package")) {
            vscode.window.showErrorMessage(`Failed to install: ${stderr}`);
          }

          resolve();
        });

        cmd.stderr?.on("data", (data) => {
          console.log(data);
          progress.report({
            message: data,
          });
        });
      })
  );
}

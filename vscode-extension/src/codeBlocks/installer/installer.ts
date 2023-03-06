import * as cargoUtils from "./cargoUtils";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as releaseUtils from "./releaseUtils";
import * as vscode from "vscode";
import which from "which";

export const CODE_BLOCKS_SERVER_VERSION = "0.5.0";

const BINARY = "code-blocks-cli";
const INSTALLED_PERM =
  fs.constants.S_IRWXU |
  fs.constants.S_IRGRP |
  fs.constants.S_IXGRP |
  fs.constants.S_IROTH |
  fs.constants.S_IXOTH;

export async function getOrInstallCli(binDirPath: string): Promise<string | undefined> {
  const installationPath = await getExecutableBinString(binDirPath);

  if (installationPath !== undefined) {
    return installationPath;
  } else {
    await installCli(binDirPath);
    return await getExecutableBinString(binDirPath);
  }
}

async function getExecutableBinString(extensionBinDirPath: string): Promise<string | undefined> {
  // TODO: allow setting path from extension settings

  const binPath = which.sync(BINARY, { nothrow: true });

  const localBinPath = path.join(extensionBinDirPath, BINARY);
  const inExtensionBinDir = fs.existsSync(localBinPath);

  if (binPath !== null) {
    return binPath;
  } else if (inExtensionBinDir) {
    if (ensureExecutable(localBinPath)) {
      return localBinPath;
    } else {
      await vscode.window.showErrorMessage(`${BINARY} is installed at ${localBinPath} but not exectuable`);
      return undefined;
    }
  } else {
    return undefined;
  }
}

async function installCli(binDirPath: string): Promise<void> {
  const installationMethod = await getInstallationMethod();

  switch (installationMethod) {
    case undefined:
      break;

    case "Install from release":
      await releaseUtils.installViaRelease(binDirPath, BINARY, INSTALLED_PERM);
      break;

    case "Install with cargo":
      await cargoUtils.installViaCargo();
      break;
  }
}

type InstallationMethod = "Install from release" | "Install with cargo";
async function getInstallationMethod(): Promise<InstallationMethod | undefined> {
  const options: InstallationMethod[] = [];
  if (releaseUtils.platformIsSupported()) {
    options.push("Install from release");
  }

  if (which.sync("cargo", { nothrow: true }) !== null) {
    options.push("Install with cargo");
  }

  if (options.length === 0) {
    await vscode.window.showErrorMessage(
      `Cargo isn't installed and system ${os.platform()}-${os.arch()} has no release target, try installing cargo`
    );
    return undefined;
  }

  return await vscode.window.showErrorMessage(`${BINARY} is not in PATH`, ...options);
}

function ensureExecutable(binPath: string): boolean {
  try {
    fs.accessSync(binPath, fs.constants.X_OK);
    return true;
  } catch (e) {
    console.log(`path ${binPath} isn't executable, changing permissions`);
    try {
      fs.chmodSync(binPath, INSTALLED_PERM);
      return true;
    } catch (e) {
      console.error(`Failed to make path: '${binPath}' executable due to exception: ${JSON.stringify(e)}`);
      return false;
    }
  }
}

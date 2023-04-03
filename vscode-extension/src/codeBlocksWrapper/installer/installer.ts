import * as cargoUtils from "./cargoUtils";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as releaseUtils from "./releaseUtils";
import * as vscode from "vscode";

const INSTALLED_PERM =
  fs.constants.S_IRWXU |
  fs.constants.S_IRGRP |
  fs.constants.S_IXGRP |
  fs.constants.S_IROTH |
  fs.constants.S_IXOTH;

export async function getOrInstallCli(binDirPath: string): Promise<string | undefined> {
  const binary = os.platform() === "win32" ? "code-blocks-cli.exe" : "code-blocks-cli";
  const installationPath = await getExecutableBinString(binary, binDirPath);

  if (installationPath !== undefined) {
    return installationPath;
  } else {
    await installCli(binary, binDirPath);
    return await getExecutableBinString(binary, binDirPath);
  }
}

async function getExecutableBinString(binary: string, extensionBinDirPath: string): Promise<string | undefined> {
  if (await cargoUtils.cmdInstalledWithCargo()) {
    console.log(`${binary} is installed with cargo`);
    return binary;
  }

  const localBinPath = path.join(extensionBinDirPath, binary);
  if (fs.existsSync(localBinPath)) {
    console.log(`${binary} is installed at ${localBinPath}`);
    if (ensureExecutable(localBinPath)) {
      return localBinPath;
    } else {
      console.log(`${binary} is installed at ${localBinPath} but not exectuable`);
      await vscode.window.showErrorMessage(`${binary} is installed at ${localBinPath} but not exectuable`);
      return undefined;
    }
  }
}

export async function installCli(binary: string, binDirPath: string): Promise<void> {
  const installationMethod = await getInstallationMethod();

  switch (installationMethod) {
    case undefined:
      break;

    case "Install from release":
      await releaseUtils.installViaRelease(binary, binDirPath, INSTALLED_PERM);
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

  if (await cargoUtils.cargoIsInstalled()) {
    options.push("Install with cargo");
  }

  if (options.length === 0) {
    await vscode.window.showErrorMessage(
      `Cargo isn't installed and system ${releaseUtils.getPlatform()} has no release target, try installing cargo`
    );
    return undefined;
  }

  return await vscode.window.showErrorMessage(`code-blocks-cli is not installed`, ...options);
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

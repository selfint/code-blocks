import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const CARGO_INSTALL_CMD = `cargo install code-blocks-server --features=cli --version 0.6.0`;

export async function cargoIsInstalled(): Promise<boolean> {
  try {
    const cargoVersion = await promisify(exec)("cargo --version");
    console.log(`Got cargo version ${JSON.stringify(cargoVersion)}`);
    if (cargoVersion.stderr.length > 0) {
      return false;
    } else {
      return true;
    }
  } catch (exception) {
    console.log(`Got exception ${JSON.stringify(exception)}`);
    return false;
  }
}

export async function cmdInstalledWithCargo(cmd: string): Promise<boolean> {
  try {
    const installedList = await promisify(exec)("cargo install --list");
    if (installedList.stderr.length > 0) {
      return false;
    } else {
      return installedList.stdout.includes(cmd);
    }
  } catch (exception) {
    console.log(`Got exception ${JSON.stringify(exception)}`);
    return false;
  }
}

export async function installViaCargo(): Promise<void> {
  const error = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: "Installing code-blocks-cli with cargo",
    },
    async (progress) =>
      await new Promise<string | undefined>((resolve) => {
        const cmd = exec(CARGO_INSTALL_CMD, (err, _, stderr) => {
          if (err !== null) {
            const errString = JSON.stringify(err);
            resolve(errString);
          } else if (!stderr.includes("Installed package")) {
            resolve(stderr);
          } else {
            resolve(undefined);
          }
        });

        cmd.stderr?.on("data", (data: string) => {
          console.log(data);
          progress.report({
            message: data,
          });
        });
      })
  );

  if (error !== undefined) {
    await vscode.window.showErrorMessage(`Failed to install: ${error}`);
  }
}

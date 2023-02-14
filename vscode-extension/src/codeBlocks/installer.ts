import { exec, spawn } from "child_process";
import * as vscode from "vscode";
import which from "which";

const BINARY = "code-blocks-cli";
const CARGO_INSTALL_CMD = "cargo install code-blocks-server --features=cli";

export async function ensureInstalled(): Promise<boolean> {
  const installed = which.sync(BINARY, { nothrow: true });

  if (installed !== null) {
    return true;
  }

  let options = ["Install from release"];
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
      vscode.window.showInformationMessage("Install from release not implemented yet");
      return false;

    case "Install with cargo":
      return new Promise<boolean>((resolve, _) => {
        exec(CARGO_INSTALL_CMD, (err, _, stderr) => {
          if (err !== null) {
            vscode.window.showErrorMessage(`Failed to install: ${err}`);
            resolve(false);
          } else if (!stderr.includes("Installed package")) {
            vscode.window.showErrorMessage(`Failed to install: ${stderr}`);
            resolve(false);
          }

          resolve(true);
        });
      });
  }
}

import * as vscode from "vscode";
import { exec } from "child_process";

const CARGO_INSTALL_CMD = "cargo install code-blocks-server --features=cli --version 0.3.0";

export async function installViaCargo(): Promise<void> {
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

import * as vscode from "vscode";
import { exec } from "child_process";

const CARGO_INSTALL_CMD = "cargo install code-blocks-server --features=cli --version 0.3.0";

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

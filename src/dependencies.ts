import { Result, err, ok } from "./result";
import { join } from "path";
import { runCmd } from "./Installer";


export function getTreeSitterCliPath(extensionPath: string): string {
    return join(extensionPath, "node_modules", "tree-sitter-cli", "tree-sitter");
}

export async function installTreeSitterCli({
    extensionPath,
    npm = "npm",
    report,
}: {
    extensionPath: string;
    npm?: string;
    report?: (msg: string) => void;
}): Promise<Result<string, string>> {
    const cmd = `${npm} install --prefix ${extensionPath} tree-sitter-cli > out2`;
    report?.(`running command: ${cmd}`);
    const result = await runCmd(cmd);
    report?.("done");

    switch (result.status) {
        case "ok":
            return ok(getTreeSitterCliPath(extensionPath));
        case "err":
            return err(
                `Failed to install tree sitter cli > ${result.result[0].name} ${result.result[0].message}` +
                (result.result[1].length > 0 ? " > " + result.result[1].join(">") : "")
            );
    }
}

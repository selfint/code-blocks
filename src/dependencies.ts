import * as fs from "fs";
import * as tar from "tar";
import { Result, err, ok } from "./result";
import { join, resolve } from "path";
import axios from "axios";
import { runCmd } from "./Installer";

const EMCC_SOURCE_URL = "https://github.com/emscripten-core/emsdk/tarball/main";

export function getTreeSitterCliPath(extensionPath: string): string {
    return join(extensionPath, "node_modules", "tree-sitter-cli", "tree-sitter");
}

export async function installTreeSitterCli(
    extensionPath: string,
    npm = "npm"
): Promise<Result<string, string>> {
    const result = await runCmd(`${npm} install --prefix ${extensionPath} tree-sitter-cli`);

    switch (result.status) {
        case "ok":
            return ok(getTreeSitterCliPath(extensionPath));
        case "err":
            return err(
                `Failed to install tree sitter cli > ${result.result[0].name} ${result.result[0].message}` +
                    (result.result[1].length > 0 ? ">" + result.result[1].join(">") : "")
            );
    }
}

export async function installEmcc(extensionPath: string): Promise<Result<string, string>> {
    const emsdkZip = resolve(join(extensionPath, "emsdk.zip"));
    await axios({
        method: "get",
        url: EMCC_SOURCE_URL,
        responseType: "stream",
    }).then(function (response) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        response.data.pipe(fs.createWriteStream(emsdkZip));
    });

    await tar.extract({ file: emsdkZip, cwd: extensionPath, strip: 1 });

    return ok("");
}

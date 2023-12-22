import * as dependencies from "../../dependencies";
import { execFileSync } from "node:child_process";
import { expect } from "chai";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

suite("dependencies", function () {
    test.only("install tree-sitter cli", async () => {
        const tempDir = await mkdtemp(join(tmpdir(), "code-blocks-test-"));
        const result = await dependencies.installTreeSitterCli({
            extensionPath: tempDir,
            report: console.log,
        });

        expect(result.status).to.equal("ok", `got err result from tree-sitter cli install: ${result.result}`);

        const treeSitterCli = dependencies.getTreeSitterCliPath(tempDir);
        expect(execFileSync(treeSitterCli, ["--version"])).to.satisfy((stdout: Buffer) =>
            stdout.toString().startsWith("tree-sitter")
        );
    }).timeout("5s");
});

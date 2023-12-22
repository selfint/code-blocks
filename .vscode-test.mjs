import { defineConfig } from "@vscode/test-cli";

let files = ["out/test/**/*.test.js", "out/examples/**/*.example.js"];
if (process.env.TEST_ONLY !== undefined) {
    files = ["out/test/**/*.test.js"];
} else if (process.env.EXAMPLE !== undefined) {
    const example =
        process.env.EXAMPLE.split(".").slice(0, -1).join(".") + ".js";
    files = [`out/examples/${example}`];
}

export default defineConfig({ files });

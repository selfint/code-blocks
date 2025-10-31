import * as path from "path";

import { runTests } from "@vscode/test-electron";

// ensure settings.json gets copied to build directory
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import settings from "./examples-editor/.vscode/settings.json";

async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, `./suite/index`);

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [path.resolve(__dirname, "examples-editor")],
        });
    } catch (err) {
        console.error("Failed to run tests", err);
        process.exit(1);
    }
}

void main();

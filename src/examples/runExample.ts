import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    if (process.argv.length !== 3) {
        console.error(`Usage: node runExample.js <example>`);
        console.log(process.argv);
        process.exit(1);
    }

    const example = process.argv[2];

    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, `./${example}/index`);

        // Download VS Code, unzip it and run the integration test
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error("Failed to run tests", err);
        process.exit(1);
    }
}

void main();

import * as Installer from "../../Installer";
import * as fs from "fs/promises";
import * as path from "path";

import Mocha from "mocha";
import glob from "glob";

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        bail: false,
    });

    const testsRoot = path.resolve(__dirname, "..");

    const parsersDir = path.resolve(testsRoot, "..", "..", "test-parsers");

    // remove parsers dir
    let exists = false;
    try {
        await fs.access(parsersDir);
        exists = true;
    } catch {
        // do nothing
    }

    if (exists) {
        await fs.rm(parsersDir, { recursive: true });
    }

    // create parsers dir
    await fs.mkdir(parsersDir);

    // install tree-sitter-rust
    let result = await Installer.getLanguage("test-parsers", "rust", true);
    if (result.status === "err") {
        throw new Error(`Failed to install language: ${result.result}`);
    }

    console.log(`Installed language: ${JSON.stringify(result.result)}`);

    // install tree-sitter-typescript
    result = await Installer.getLanguage("test-parsers", "typescript", true);
    if (result.status === "err") {
        throw new Error(`Failed to install language: ${result.result}`);
    }

    console.log(`Installed language: ${JSON.stringify(result.result)}`);

    return new Promise((c, e) => {
        glob("**/**.test.js", { cwd: testsRoot }, (err, files) => {
            if (err) {
                return e(err);
            }

            // Add files to the test suite
            files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // Run the mocha test
                mocha.run((failures) => {
                    if (failures > 0) {
                        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                        e(new Error(`${failures} tests failed.`));
                    } else {
                        c();
                    }
                });
            } catch (err) {
                console.error(err);
                e(err);
            }
        });
    });
}

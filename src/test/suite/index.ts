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
    });

    const testsRoot = path.resolve(__dirname, "..");

    // install test parsers
    const parsersDir = "test-parsers";

    // reset parsers dir
    let exists;
    try {
        await fs.access(parsersDir);
        exists = true;
    } catch (e) {
        exists = false;
    }

    if (exists) {
        await fs.rm(parsersDir, { recursive: true });
    }

    await fs.mkdir(parsersDir, { recursive: true });

    // install rust parser
    let result = await Installer.getLanguage(parsersDir, "rust", true);
    if (result.status === "err") {
        throw new Error(`Failed to install Rust parser: ${result.result}`);
    }

    result = await Installer.getLanguage(parsersDir, "typescriptreact", true);
    if (result.status === "err") {
        throw new Error(`Failed to install TSX parser: ${result.result}`);
    }

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

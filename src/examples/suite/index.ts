import * as path from "path";
import Mocha from "mocha";
import { glob } from "glob";

export async function run(): Promise<void> {
    let example = process.env.EXAMPLE;
    if (example === undefined) {
        console.log("@".repeat(1000));
        console.error("No example file specified, set EXAMPLE environ found");
        process.exit(1);
    }

    // change extension to .js
    example = example.slice(0, -2) + "js";

    const mocha = new Mocha({ ui: "tdd", color: true });
    const testsRoot = path.resolve(__dirname, "..");

    try {
        const files = await glob(`suite/${example}`, { cwd: testsRoot });

        // Add files to the test suite
        files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

        await new Promise<void>((resolve, reject) => {
            // Run the mocha test
            mocha.run((failures) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error(err);
        throw err;
    }
}

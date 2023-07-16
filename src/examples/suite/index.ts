import * as path from "path";
import Mocha from "mocha";
import glob from "glob";

export function run(): Promise<void> {
    if (process.env.EXAMPLE === undefined) {
        console.log("@".repeat(1000));
        console.error("No example file specified, set EXAMPLE environ found");
        process.exit(1);
    }

    // change extension to .js
    let example = process.env.EXAMPLE;
    example = example.substring(0, example.length - 2) + "js";

    // Create the mocha test
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
    });

    const testsRoot = path.resolve(__dirname, "..");

    return new Promise((c, e) => {
        glob(`suite/${example}`, { cwd: testsRoot }, (err, files) => {
            if (err) {
                return e(err);
            }

            // Add files to the test suite
            files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // Run the mocha test
                mocha.run((failures) => {
                    if (failures > 0) {
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

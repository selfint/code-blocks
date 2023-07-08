import * as path from "path";
import Mocha from "mocha";
import glob from "glob";

export function run(): Promise<void> {
    if (process.argv.length !== 3) {
        console.error(`Usage: node runExample.js <example>`);
        console.log(`Got args: ${JSON.stringify(process.argv)}`);
        process.exit(1);
    }

    // change extension to .js
    const example = process.argv[2].substring(0, -2) + "js";

    // Create the mocha test
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
    });

    const testsRoot = path.resolve(__dirname, "..");

    return new Promise((c, e) => {
        glob(`**/${example}`, { cwd: testsRoot }, (err, files) => {
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

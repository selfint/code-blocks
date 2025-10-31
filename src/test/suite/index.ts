import * as path from "path";

import Mocha from "mocha";
import { glob } from "glob";

export async function run(): Promise<void> {
    const mocha = new Mocha({ ui: "tdd", color: true, bail: false });
    const testsRoot = path.resolve(__dirname, "..");

    try {
        const files = await glob("**/**.test.js", { cwd: testsRoot });

        files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

        await new Promise<void>((resolve, reject) => {
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

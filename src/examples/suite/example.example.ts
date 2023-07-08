import * as vscode from "vscode";
import { initExample, openDocument, sleep } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "20s";
test("Example", async function () {
    await initExample();
    void vscode.window.showInformationMessage("Hello world");
    await sleep(1500);

    await openDocument({
        language: "rust",
        content: `// hello world
`,
        maximize: true,
    });

    await sleep(1500);
}).timeout(TIMEOUT);

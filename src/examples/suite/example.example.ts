import * as vscode from "vscode";
import { openDocument, sleep } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "20s";
test("Example", async function () {
    void vscode.window.showInformationMessage("Hello world");
    await sleep(1500);

    await openDocument(
        "rust",
        `// hello world
`
    );

    await sleep(1500);
}).timeout(TIMEOUT);

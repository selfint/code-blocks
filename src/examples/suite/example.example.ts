import * as vscode from "vscode";
import { openDocument, sleep } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "20s";
test("Example", async function () {
    void vscode.window.showInformationMessage("Open any file");
    await sleep(1500);

    await openDocument(
        `
#[derive(Debug)]
struct A {
    /// b property
    b: u32
}

fn main() {

}
`,
        "rust"
    );

    await sleep(1500);
}).timeout(TIMEOUT);

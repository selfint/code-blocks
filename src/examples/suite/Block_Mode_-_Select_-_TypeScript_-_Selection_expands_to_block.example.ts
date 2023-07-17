import { selectionExample } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "30s";
test("Block mode", async function () {
    await selectionExample({
        language: "typescriptreact",
        content: `/** Selection is always expanded to the nearest block
*/
function m@ain() {
    console.log("hello world");
}`,
        cursor: "@",
        selectionCommands: [
            "codeBlocks.selectBlock",
            "codeBlocks.selectParent",
        ],
        expectedSelectionContent: `/** Selection is always expanded to the nearest block
*/
function main() {
    console.log("hello world");
}`,
        pause: 2000,
    });
}).timeout(TIMEOUT);

import { selectionExample } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "30s";
test("Block mode", async function () {
    await selectionExample({
        language: "typescriptreact",
        content: `/** Selection is always expanded to the nearest block
*/
funct@ion main() {
    console.log("hello world");
}

function foo() {
    console.log("hi");
}
`,
        cursor: "@",
        selectionCommands: [
            "codeBlocks.selectBlock",
        ],
        expectedSelectionContent: `/** Selection is always expanded to the nearest block
*/
function main() {
    console.log("hello world");
}`,
        pause: 2000,
    });
}).timeout(TIMEOUT);

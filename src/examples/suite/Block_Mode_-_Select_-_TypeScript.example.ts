import { selectionExample } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "2m";
test("Block mode", async function () {
    await selectionExample({
        language: "typescriptreact",
        content: `function main() {
    switch (Date.now() % 3) {
        case 0:
            console.log("hi");
        case 1:
            console.log("he@llo");
        case 2:
            console.log("howdy");
    }
}`,
        cursor: "@",
        selectionCommands: [
            "codeBlocks.selectParent",
            "codeBlocks.selectParent",
            "codeBlocks.selectParent",
            "codeBlocks.selectParent",
            "codeBlocks.selectParent",
            "codeBlocks.selectNext",
            "codeBlocks.selectPrevious",
        ],
        expectedSelectionContent: `case 0:
            console.log("hi");
        case 1:
            console.log("hello");
        case 2:
            console.log("howdy");`,
        pause: 1000,
    });
}).timeout(TIMEOUT);

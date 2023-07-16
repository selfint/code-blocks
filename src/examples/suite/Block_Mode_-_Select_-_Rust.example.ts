import { selectionExample } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "2m";
test("Block mode", async function () {
    await selectionExample({
        language: "rust",
        content: "fn main() {\n    let a = [1, 2@22, 3];\n}",
        maximize: true,
        cursor: "@",
        selectionCommands: [
            "codeBlocks.selectBlock",
            "codeBlocks.selectNext",
            "codeBlocks.selectParent",
            "codeBlocks.selectChild",
        ],
        expectedSelectionContent: "1",
        pause: 2000,
    });
}).timeout(TIMEOUT);

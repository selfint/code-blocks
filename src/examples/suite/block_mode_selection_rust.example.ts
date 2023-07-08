import { openFolder, sleep, testSelectionCommands } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "2m";
test("Block mode", async function () {
    await openFolder();
    await testSelectionCommands({
        language: "rust",
        content: "fn main() { let a = [1, 2@22, 3]; }",
        selectionCommands: [
            "codeBlocks.selectBlock",
            "codeBlocks.selectNext",
            "codeBlocks.selectParent",
            "codeBlocks.selectChild",
        ],
        expectedSelectionContent: "1",
        pause: 2000,
        maximize: true,
    });

    await sleep(1500);
}).timeout(TIMEOUT);

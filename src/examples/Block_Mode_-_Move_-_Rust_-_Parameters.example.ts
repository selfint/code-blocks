import { moveExample } from "./exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "2m";
test("Block mode 2", async function () {
    await moveExample({
        language: "rust",
        content: `fn add(first: usize, second: @usize): usize {
    return first + second;
}`,
        cursor: "@",
        selectionCommands: ["codeBlocks.selectParent"],
        selectionMessage: "Select parameter",
        moveCommands: ["codeBlocks.moveUp", "codeBlocks.moveDown", "codeBlocks.moveUp"],
        expectedSelectionContent: `second: usize`,
        expectedContent: `fn add(second: usize, first: usize): usize {
    return first + second;
}`,
        pause: 1000,
    });
}).timeout(TIMEOUT);

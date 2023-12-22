import { moveExample } from "./exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "2m";
test("Block_Mode_-_Move_-_Rust_-_Functions", async function () {
    await moveExample({
        language: "rust",
        content: `
/// adds two numbers
fn add(first: usize, second: usize): usize {
    let sum = first + second;

    return sum;
}

/// subtracts two numbers
fn su@b(first: usize, second: usize): usize {
    return first - second;
}`,
        cursor: "@",
        selectionCommands: ["codeBlocks.selectParent"],
        selectionMessage: "Select function",
        moveCommands: ["codeBlocks.moveUp", "codeBlocks.moveDown", "codeBlocks.moveUp", "codeBlocks.moveDown"],
        expectedSelectionContent: `/// subtracts two numbers
fn sub(first: usize, second: usize): usize {
    return first - second;
}`,
        expectedContent: `
/// adds two numbers
fn add(first: usize, second: usize): usize {
    let sum = first + second;

    return sum;
}

/// subtracts two numbers
fn sub(first: usize, second: usize): usize {
    return first - second;
}`,
        pause: 1000,
    });
}).timeout(TIMEOUT);

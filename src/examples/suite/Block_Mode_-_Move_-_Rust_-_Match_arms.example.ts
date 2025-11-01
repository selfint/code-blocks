import { moveExample } from "../exampleUtils";

const TIMEOUT = process.env.EXAMPLE_TIMEOUT ?? "2m";
test("Block mode 2", async function () {
    await moveExample({
        language: "rust",
        content: `\
fn main() {
    match rand::thread_rng().gen_range(0..=7) {
        0 => println!("hi"),
        1 => println!("he@llo"),
        2 => println!("howdy"),
        3 => println!("howdy hoo"),
        4 => println!("howdy there"),
        5 => println!("he@llo there"),
        6 => println!("goodbye"),
        _ => println!("salutations"),
    }
}`,
        cursor: "@",
        selectionCommands: [
            "codeBlocks.selectParent",
            "codeBlocks.selectParent",
            "codeBlocks.selectParent",
            "codeBlocks.selectParent",
            "codeBlocks.selectPrevious",
        ],
        selectionMessage: "Select match arms",
        moveCommands: ["codeBlocks.moveDown", "codeBlocks.moveDown", "codeBlocks.moveUp"],
        expectedSelectionContent: [
            `0 => println!("hi"),
        1 => println!("hello"),`,
            `4 => println!("howdy there"),
        5 => println!("hello there"),`,
        ],
        expectedContent: `\
fn main() {
    match rand::thread_rng().gen_range(0..=7) {
        2 => println!("howdy"),
        0 => println!("hi"),
        1 => println!("hello"),
        3 => println!("howdy hoo"),
        6 => println!("goodbye"),
        4 => println!("howdy there"),
        5 => println!("hello there"),
        _ => println!("salutations"),
    }
}`,
        pause: 1000,
    });
}).timeout(TIMEOUT);

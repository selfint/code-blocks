import { expect } from "chai";
import * as vscode from "vscode";
import { openDocument } from "./testUtils";

suite("Pair Selection", function () {
    this.timeout(process.env.TEST_TIMEOUT ?? "2s");

    suite("selectInside", function () {
        this.beforeAll(() => {
            return void vscode.window.showInformationMessage("Start PairSelection.selectInside tests");
        });

        test("it recursively selects inside out in tsx", async function () {
            const content = `const x = { foo: (bar) };`;
            const { activeEditor } = await openDocument(content, "typescriptreact");

            // 1. Start with cursor on "bar"
            const idxBar = content.indexOf("bar");
            activeEditor.selection = new vscode.Selection(0, idxBar, 0, idxBar);

            // 2. Select `bar`
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            let selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal("bar");

            // 3. Select `(bar)`
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal("(bar)");

            // 4. Select `foo: (bar)` -> This is not a standard pair, so expansion should stop or go to the next structural pair.
            // The current logic will expand to the content of the object, which is correct.
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal(" foo: (bar) ");

            // 5. Select `{ foo: (bar) }`
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal("{ foo: (bar) }");
        });

        test("it selects inside function call parentheses", async function () {
            const content = `useQuery({ key: ["value"] });`;
            const { activeEditor } = await openDocument(content, "typescript");

            // 1. Start with cursor on "key"
            const idxKey = content.indexOf("key");
            activeEditor.selection = new vscode.Selection(0, idxKey, 0, idxKey);

            // 2. Select content of object
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            let selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal(`key: ["value"]`);

            // 3. Select object including braces
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal(`{ key: ["value"] }`);

            // 4. Select arguments including parentheses
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal(`({ key: ["value"] })`);
        });

        test("it selects inside with multi-cursor and merges overlaps", async function () {
            const content = `const obj = { foo: { bar: [1, 2] } };`;
            const { activeEditor } = await openDocument(content, "typescript");

            const idxBar = content.indexOf("bar");
            const idxOne = content.indexOf("1");

            const posBar = activeEditor.document.positionAt(idxBar);
            const posOne = activeEditor.document.positionAt(idxOne);

            activeEditor.selections = [
                new vscode.Selection(posBar, posBar),
                new vscode.Selection(posOne, posOne),
            ];

            await vscode.commands.executeCommand("codeBlocks.selectInside");

            const selections = activeEditor.selections;
            expect(selections.length).to.equal(1);
            const text = activeEditor.document.getText(selections[0]).trim();
            expect(text).to.equal("bar: [1, 2]");
        });

        test("it selects inside with multi-cursor across distinct objects", async function () {
            const content = `const a = ({ x: 1 }); const b = ({ y: 2 });`;
            const { activeEditor } = await openDocument(content, "typescript");

            const idxX = content.indexOf("x");
            const idxY = content.indexOf("y");

            const posX = activeEditor.document.positionAt(idxX);
            const posY = activeEditor.document.positionAt(idxY);

            activeEditor.selections = [
                new vscode.Selection(posX, posX),
                new vscode.Selection(posY, posY),
            ];

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selections2 = activeEditor.selections;
            expect(selections2.length).to.equal(2);
            const texts = selections2.map(s => activeEditor.document.getText(s).trim());
            expect(texts).to.deep.equal(["x: 1", "y: 2"]);
        });

        test("it selects inside JSON array elements", async function () {
            const content = `{ "a": [1, 2, 3] }`;
            const { activeEditor } = await openDocument(content, "json");

            const idx2 = content.indexOf("2");
            const pos2 = activeEditor.document.positionAt(idx2);
            activeEditor.selection = new vscode.Selection(pos2, pos2);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal("1, 2, 3");
        });

        test("it selects inside Rust function body", async function () {
            const content = `fn main() { println!("Hello"); }`;
            const { activeEditor } = await openDocument(content, "rust");

            const idxPrint = content.indexOf("println");
            const posPrint = activeEditor.document.positionAt(idxPrint);
            activeEditor.selection = new vscode.Selection(posPrint, posPrint);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal(`println!("Hello");`);
        });

        test("it selects inside JavaScript array", async function () {
            const content = `const arr = [1, 2, 3];`;
            const { activeEditor } = await openDocument(content, "javascript");

            const idx2 = content.indexOf("2");
            const pos2 = activeEditor.document.positionAt(idx2);
            activeEditor.selection = new vscode.Selection(pos2, pos2);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal("1, 2, 3");
        });

        test("it selects inside Java method body", async function () {
            const content = `class Test { public void method() { System.out.println("test"); } }`;
            const { activeEditor } = await openDocument(content, "java");

            const idxSystem = content.indexOf("System");
            const posSystem = activeEditor.document.positionAt(idxSystem);
            activeEditor.selection = new vscode.Selection(posSystem, posSystem);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal(`System.out.println("test");`);
        });

        test("it selects inside Python list", async function () {
            const content = `data = [1, 2, 3]`;
            const { activeEditor } = await openDocument(content, "python");

            const idx2 = content.indexOf("2");
            const pos2 = activeEditor.document.positionAt(idx2);
            activeEditor.selection = new vscode.Selection(pos2, pos2);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal("1, 2, 3");
        });

        test("it selects inside C function body", async function () {
            const content = `int main() { printf("Hello"); return 0; }`;
            const { activeEditor } = await openDocument(content, "c");

            const idxPrintf = content.indexOf("printf");
            const posPrintf = activeEditor.document.positionAt(idxPrintf);
            activeEditor.selection = new vscode.Selection(posPrintf, posPrintf);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal(`printf("Hello"); return 0;`);
        });

        test("it selects inside C++ function body", async function () {
            const content = `int main() { std::cout << "Hello"; return 0; }`;
            const { activeEditor } = await openDocument(content, "cpp");

            const idxCout = content.indexOf("std::cout");
            const posCout = activeEditor.document.positionAt(idxCout);
            activeEditor.selection = new vscode.Selection(posCout, posCout);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal(`std::cout << "Hello"; return 0;`);
        });

        test("it selects inside C# method body", async function () {
            const content = `class Test { static void Main() { Console.WriteLine("Hello"); } }`;
            const { activeEditor } = await openDocument(content, "csharp");

            const idxConsole = content.indexOf("Console");
            const posConsole = activeEditor.document.positionAt(idxConsole);
            activeEditor.selection = new vscode.Selection(posConsole, posConsole);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal(`Console.WriteLine("Hello");`);
        });

        test("it selects inside Go function body", async function () {
            const content = `func main() { fmt.Println("Hello") }`;
            const { activeEditor } = await openDocument(content, "go");

            const idxFmt = content.indexOf("fmt");
            const posFmt = activeEditor.document.positionAt(idxFmt);
            activeEditor.selection = new vscode.Selection(posFmt, posFmt);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal(`fmt.Println("Hello")`);
        });

        test("it selects inside Ruby array", async function () {
            const content = `arr = [1, 2, 3]`;
            const { activeEditor } = await openDocument(content, "ruby");

            const idx2 = content.indexOf("2");
            const pos2 = activeEditor.document.positionAt(idx2);
            activeEditor.selection = new vscode.Selection(pos2, pos2);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal("1, 2, 3");
        });

        test("it selects inside CSS rule body", async function () {
            const content = `body { color: red; background: blue; }`;
            const { activeEditor } = await openDocument(content, "css");

            const idxColor = content.indexOf("color");
            const posColor = activeEditor.document.positionAt(idxColor);
            activeEditor.selection = new vscode.Selection(posColor, posColor);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal("color: red; background: blue;");
        });

        test("it selects inside YAML array", async function () {
            const content = `items: [one, two, three]`;
            const { activeEditor } = await openDocument(content, "yaml");

            const idxTwo = content.indexOf("two");
            const posTwo = activeEditor.document.positionAt(idxTwo);
            activeEditor.selection = new vscode.Selection(posTwo, posTwo);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal("one, two, three");
        });

        // test("it selects inside Kotlin function body", async function () {
        //     const content = `fun main() { println("Hello") }`;
        //     const { activeEditor } = await openDocument(content, "kotlin");

        //     const idxPrintln = content.indexOf("println");
        //     const posPrintln = activeEditor.document.positionAt(idxPrintln);
        //     activeEditor.selection = new vscode.Selection(posPrintln, posPrintln);

        //     await vscode.commands.executeCommand("codeBlocks.selectInside");
        //     const selection = activeEditor.selection;
        //     expect(activeEditor.document.getText(selection).trim()).to.equal(`println("Hello")`);
        // });

        // test("it selects inside Zig function body", async function () {
        //     const content = `pub fn main() void { std.debug.print("Hello"); }`;
        //     const { activeEditor } = await openDocument(content, "zig");

        //     const idxPrint = content.indexOf("std.debug.print");
        //     const posPrint = activeEditor.document.positionAt(idxPrint);
        //     activeEditor.selection = new vscode.Selection(posPrint, posPrint);

        //     await vscode.commands.executeCommand("codeBlocks.selectInside");
        //     const selection = activeEditor.selection;
        //     expect(activeEditor.document.getText(selection).trim()).to.equal(`std.debug.print("Hello");`);
        // });

        test("it selects inside Bash array", async function () {
            const content = `arr=(one two three)`;
            const { activeEditor } = await openDocument(content, "shellscript");

            const idxTwo = content.indexOf("two");
            const posTwo = activeEditor.document.positionAt(idxTwo);
            activeEditor.selection = new vscode.Selection(posTwo, posTwo);

            await vscode.commands.executeCommand("codeBlocks.selectInside");
            const selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal("one two three");
        });

        test("it selects inside complex TypeScript function parameter type", async function () {
            const content = `function mapReferralForClient(referral: { status: "pending" | "accepted" | "rejected"; } & { lawyer: { id: number | null; user: { id: string; } | null } | null }) {}`;
            const { activeEditor } = await openDocument(content, "typescript");

            // Start with cursor on "status"
            const idxStatus = content.indexOf("status");
            const posStatus = activeEditor.document.positionAt(idxStatus);
            activeEditor.selection = new vscode.Selection(posStatus, posStatus);

            // 1. Select inside the first object type
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            let selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection).trim()).to.equal(`status: "pending" | "accepted" | "rejected";`);

            // 2. Select the first object braces
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            selection = activeEditor.selection;
            expect(activeEditor.document.getText(selection)).to.equal(`{ status: "pending" | "accepted" | "rejected"; }`);

            // 3. Continue expanding to the parameter type
            await vscode.commands.executeCommand("codeBlocks.selectInside");
            selection = activeEditor.selection;
            // Should select the entire type annotation
            expect(activeEditor.document.getText(selection)).to.include("status");
            expect(activeEditor.document.getText(selection)).to.include("lawyer");
        });
        

        // test("it selects inside Svelte script block", async function () {
        //     const content = `<script>let x = { a: 1 };</script>`;
        //     const { activeEditor } = await openDocument(content, "svelte");

        //     const idxA = content.indexOf("a");
        //     const posA = activeEditor.document.positionAt(idxA);
        //     activeEditor.selection = new vscode.Selection(posA, posA);

        //     await vscode.commands.executeCommand("codeBlocks.selectInside");
        //     const selection = activeEditor.selection;
        //     expect(activeEditor.document.getText(selection).trim()).to.equal("a: 1");
        // });
    });

    suite("selectSurroundingPair", function () {
        this.beforeAll(() => {
            return void vscode.window.showInformationMessage("Start PairSelection.selectSurroundingPair tests");
        });

        test("it selects surrounding braces with multi-cursor", async function () {
            const content = `const x = { foo: "bar" };`;
            const { activeEditor } = await openDocument(content, "typescript");

            const idxFoo = content.indexOf("foo");
            activeEditor.selection = new vscode.Selection(0, idxFoo, 0, idxFoo);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });

        test("it selects surrounding jsx tags with multi-cursor", async function () {
            const content = `<div><p>hello</p></div>`;
            const { activeEditor } = await openDocument(content, "typescriptreact");

            const idxHello = content.indexOf("hello");
            activeEditor.selection = new vscode.Selection(0, idxHello, 0, idxHello);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("<p>");
            expect(activeEditor.document.getText(selections[1])).to.equal("</p>");
        });

        test("it selects surrounding brackets in JSON arrays", async function () {
            const content = `{ "a": [1, 2] }`;
            const { activeEditor } = await openDocument(content, "json");

            const idx1 = content.indexOf("1");
            const pos1 = activeEditor.document.positionAt(idx1);
            activeEditor.selection = new vscode.Selection(pos1, pos1);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("[");
            expect(activeEditor.document.getText(selections[1])).to.equal("]");
        });

        test("it selects surrounding brackets for multiple arrays with multi-cursor", async function () {
            const content = `{ "a": [1], "b": [2] }`;
            const { activeEditor } = await openDocument(content, "json");

            const idxA = content.indexOf("1");
            const idxB = content.indexOf("2");
            const posA = activeEditor.document.positionAt(idxA);
            const posB = activeEditor.document.positionAt(idxB);

            activeEditor.selections = [new vscode.Selection(posA, posA), new vscode.Selection(posB, posB)];

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(4);
            const texts = selections.map(s => activeEditor.document.getText(s));
            expect(texts).to.deep.equal(["[", "]", "[", "]"]);
        });

        test("it selects surrounding braces in Rust", async function () {
            const content = `fn main() { println!("Hello"); }`;
            const { activeEditor } = await openDocument(content, "rust");

            const idxPrint = content.indexOf("println");
            const posPrint = activeEditor.document.positionAt(idxPrint);
            activeEditor.selection = new vscode.Selection(posPrint, posPrint);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });

        test("it selects surrounding brackets in JavaScript", async function () {
            const content = `const arr = [1, 2, 3];`;
            const { activeEditor } = await openDocument(content, "javascript");

            const idx2 = content.indexOf("2");
            const pos2 = activeEditor.document.positionAt(idx2);
            activeEditor.selection = new vscode.Selection(pos2, pos2);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("[");
            expect(activeEditor.document.getText(selections[1])).to.equal("]");
        });

        test("it selects surrounding braces in Java", async function () {
            const content = `class Test { public void method() { System.out.println("test"); } }`;
            const { activeEditor } = await openDocument(content, "java");

            const idxSystem = content.indexOf("System");
            const posSystem = activeEditor.document.positionAt(idxSystem);
            activeEditor.selection = new vscode.Selection(posSystem, posSystem);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });

        test("it selects surrounding brackets in Python", async function () {
            const content = `data = [1, 2, 3]`;
            const { activeEditor } = await openDocument(content, "python");

            const idx2 = content.indexOf("2");
            const pos2 = activeEditor.document.positionAt(idx2);
            activeEditor.selection = new vscode.Selection(pos2, pos2);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("[");
            expect(activeEditor.document.getText(selections[1])).to.equal("]");
        });

        test("it selects surrounding braces in C", async function () {
            const content = `int main() { printf("Hello"); return 0; }`;
            const { activeEditor } = await openDocument(content, "c");

            const idxPrintf = content.indexOf("printf");
            const posPrintf = activeEditor.document.positionAt(idxPrintf);
            activeEditor.selection = new vscode.Selection(posPrintf, posPrintf);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });

        test("it selects surrounding braces in C++", async function () {
            const content = `int main() { std::cout << "Hello"; return 0; }`;
            const { activeEditor } = await openDocument(content, "cpp");

            const idxCout = content.indexOf("std::cout");
            const posCout = activeEditor.document.positionAt(idxCout);
            activeEditor.selection = new vscode.Selection(posCout, posCout);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });

        test("it selects surrounding braces in C#", async function () {
            const content = `class Test { static void Main() { Console.WriteLine("Hello"); } }`;
            const { activeEditor } = await openDocument(content, "csharp");

            const idxConsole = content.indexOf("Console");
            const posConsole = activeEditor.document.positionAt(idxConsole);
            activeEditor.selection = new vscode.Selection(posConsole, posConsole);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });

        test("it selects surrounding braces in Go", async function () {
            const content = `func main() { fmt.Println("Hello") }`;
            const { activeEditor } = await openDocument(content, "go");

            const idxFmt = content.indexOf("fmt");
            const posFmt = activeEditor.document.positionAt(idxFmt);
            activeEditor.selection = new vscode.Selection(posFmt, posFmt);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });

        test("it selects surrounding brackets in Ruby", async function () {
            const content = `arr = [1, 2, 3]`;
            const { activeEditor } = await openDocument(content, "ruby");

            const idx2 = content.indexOf("2");
            const pos2 = activeEditor.document.positionAt(idx2);
            activeEditor.selection = new vscode.Selection(pos2, pos2);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("[");
            expect(activeEditor.document.getText(selections[1])).to.equal("]");
        });

        test("it selects surrounding braces in CSS", async function () {
            const content = `body { color: red; background: blue; }`;
            const { activeEditor } = await openDocument(content, "css");

            const idxColor = content.indexOf("color");
            const posColor = activeEditor.document.positionAt(idxColor);
            activeEditor.selection = new vscode.Selection(posColor, posColor);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });

        test("it selects surrounding brackets in YAML", async function () {
            const content = `items: [one, two, three]`;
            const { activeEditor } = await openDocument(content, "yaml");

            const idxTwo = content.indexOf("two");
            const posTwo = activeEditor.document.positionAt(idxTwo);
            activeEditor.selection = new vscode.Selection(posTwo, posTwo);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("[");
            expect(activeEditor.document.getText(selections[1])).to.equal("]");
        });

        // test("it selects surrounding braces in Kotlin", async function () {
        //     const content = `fun main() { println("Hello") }`;
        //     const { activeEditor } = await openDocument(content, "kotlin");

        //     const idxPrintln = content.indexOf("println");
        //     const posPrintln = activeEditor.document.positionAt(idxPrintln);
        //     activeEditor.selection = new vscode.Selection(posPrintln, posPrintln);

        //     await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
        //     const selections = activeEditor.selections;
        //     expect(selections.length).to.equal(2);
        //     expect(activeEditor.document.getText(selections[0])).to.equal("{");
        //     expect(activeEditor.document.getText(selections[1])).to.equal("}");
        // });

        // test("it selects surrounding braces in Zig", async function () {
        //     const content = `pub fn main() void { std.debug.print("Hello"); }`;
        //     const { activeEditor } = await openDocument(content, "zig");

        //     const idxPrint = content.indexOf("std.debug.print");
        //     const posPrint = activeEditor.document.positionAt(idxPrint);
        //     activeEditor.selection = new vscode.Selection(posPrint, posPrint);

        //     await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
        //     const selections = activeEditor.selections;
        //     expect(selections.length).to.equal(2);
        //     expect(activeEditor.document.getText(selections[0])).to.equal("{");
        //     expect(activeEditor.document.getText(selections[1])).to.equal("}");
        // });

        test("it selects surrounding parentheses in Bash", async function () {
            const content = `arr=(one two three)`;
            const { activeEditor } = await openDocument(content, "shellscript");

            const idxTwo = content.indexOf("two");
            const posTwo = activeEditor.document.positionAt(idxTwo);
            activeEditor.selection = new vscode.Selection(posTwo, posTwo);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("(");
            expect(activeEditor.document.getText(selections[1])).to.equal(")");
        });

        // test("it selects surrounding braces in Svelte", async function () {
        //     const content = `<script>let x = { a: 1 };</script>`;
        //     const { activeEditor } = await openDocument(content, "svelte");

        //     const idxA = content.indexOf("a");
        //     const posA = activeEditor.document.positionAt(idxA);
        //     activeEditor.selection = new vscode.Selection(posA, posA);

        //     await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
        //     const selections = activeEditor.selections;
        //     expect(selections.length).to.equal(2);
        //     expect(activeEditor.document.getText(selections[0])).to.equal("{");
        //     expect(activeEditor.document.getText(selections[1])).to.equal("}");
        // });

        test("it selects surrounding HTML tags", async function () {
            const content = `<html><body><p>Hello World</p></body></html>`;
            const { activeEditor } = await openDocument(content, "html");

            const idxHello = content.indexOf("Hello");
            const posHello = activeEditor.document.positionAt(idxHello);
            activeEditor.selection = new vscode.Selection(posHello, posHello);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("<p>");
            expect(activeEditor.document.getText(selections[1])).to.equal("</p>");
        });

        test("it selects surrounding brackets in Markdown links", async function () {
            const content = `[Click here](https://example.com)`;
            const { activeEditor } = await openDocument(content, "markdown");

            const idxClick = content.indexOf("Click");
            const posClick = activeEditor.document.positionAt(idxClick);
            activeEditor.selection = new vscode.Selection(posClick, posClick);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("[");
            expect(activeEditor.document.getText(selections[1])).to.equal("]");
        });

        test("it selects surrounding braces in complex TypeScript function parameter type", async function () {
            const content = `function mapReferralForClient(referral: { status: "pending" | "accepted" | "rejected"; } & { lawyer: { id: number | null; user: { id: string; } | null } | null }) {}`;
            const { activeEditor } = await openDocument(content, "typescript");

            // Start with cursor on "status"
            const idxStatus = content.indexOf("status");
            const posStatus = activeEditor.document.positionAt(idxStatus);
            activeEditor.selection = new vscode.Selection(posStatus, posStatus);

            await vscode.commands.executeCommand("codeBlocks.selectSurroundingPair");
            const selections = activeEditor.selections;
            expect(selections.length).to.equal(2);
            expect(activeEditor.document.getText(selections[0])).to.equal("{");
            expect(activeEditor.document.getText(selections[1])).to.equal("}");
        });
        
    });
});

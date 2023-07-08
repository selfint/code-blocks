import * as vscode from "vscode";
import { openDocument, sleep } from "../../exampleUtils";
import { TreeViewer } from "../../../TreeViewer";
import { expect } from "chai";

test("Tree viewer example", async function () {
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
    void vscode.window.showInformationMessage("Call the 'codeBlocks.openTreeViewer' command");
    await sleep(1500);

    await vscode.commands.executeCommand("codeBlocks.openTreeViewer");
    const treeViewerDocument = await vscode.workspace.openTextDocument(TreeViewer.uri);
    while (treeViewerDocument.getText() === TreeViewer.placeholder) {
        await new Promise<void>((r) => TreeViewer.treeViewer.onDidChange(() => r()));
    }

    expect("\n" + treeViewerDocument.getText()).to.be.equal(`
source_file [1:0 - 10:0]
  attribute_item [1:0 - 1:16]
    attribute [1:2 - 1:15]
      identifier [1:2 - 1:8]
      token_tree [1:8 - 1:15]
        identifier [1:9 - 1:14]
  struct_item [2:0 - 5:1]
    type_identifier [2:7 - 2:8]
    field_declaration_list [2:9 - 5:1]
      line_comment [3:4 - 3:18]
      field_declaration [4:4 - 4:10]
        field_identifier [4:4 - 4:5]
        primitive_type [4:7 - 4:10]
  function_item [7:0 - 9:1]
    identifier [7:3 - 7:7]
    parameters [7:7 - 7:9]
    block [7:10 - 9:1]`);

    await sleep(1500);
}).timeout(process.env.TEST_TIMEOUT ?? "2s");

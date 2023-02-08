import * as vscode from "vscode";
import {
  BlockLocation,
  getBlockTrees,
  getQueryStrings,
  moveBlock,
  MoveItemArgs,
  SUPPORTED_LANGUAGES,
} from "./codeBlocks/codeBlocks";
import { getNonce } from "./utilities/getNonce";
import { getUri } from "./utilities/getUri";

/**
 * Provider for cat scratch editors.
 *
 * Cat scratch editors are used for `.cscratch` files, which are just json files.
 * To get started, run this extension and open an empty `.cscratch` file in VS Code.
 *
 * This provider demonstrates:
 *
 * - Setting up the initial webview for a custom editor.
 * - Loading scripts and styles in a custom editor.
 * - Synchronizing changes between a text document and a custom editor.
 */
export class CodeBlocksEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = "codeBlocks.editor";

  private static readonly scratchCharacters = ["😸", "😹", "😺", "😻", "😼", "😽", "😾", "🙀", "😿", "🐱"];

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new CodeBlocksEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      CodeBlocksEditorProvider.viewType,
      provider
    );
    return providerRegistration;
  }

  /**
   * Called when our custom editor is opened.
   *
   *
   */
  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    function getDocLang() {
      let lang = document.languageId;

      if (lang === "typescriptreact") {
        lang = "tsx";
      }

      return lang;
    }

    async function updateWebview() {
      const text = document.getText();
      const lang = getDocLang();

      // @ts-expect-error
      if (SUPPORTED_LANGUAGES.includes(lang)) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const blockTrees = await getBlockTrees({
          content: text,
          // @ts-expect-error
          items: getQueryStrings(lang),
          // @ts-expect-error
          language: getDocLang(),
        });

        webviewPanel.webview.postMessage({
          type: "update",
          text: document.getText(),
          blockTrees: blockTrees,
        });
      } else {
        vscode.window.showErrorMessage(`Opened file in unsupported language: ${document.languageId}`);
        return;
      }
    }

    // Hook up event handlers so that we can synchronize the webview with the text document.
    //
    // The text document acts as our model, so we have to sync change in the document to our
    // editor and sync changes in the editor back to the document.
    //
    // Remember that a single text document can also be shared between multiple custom
    // editors (this happens for example when you split a custom editor)

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        await updateWebview();
      }
    });

    // Make sure we get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const newContent = event.document.getText();

      const blockTrees = await getBlockTrees({
        content: newContent,
        // @ts-expect-error
        items: getQueryStrings(getDocLang()),
        // @ts-expect-error
        language: getDocLang(),
      });

      webviewPanel.webview.postMessage({
        type: "update",
        text: newContent,
        blockTrees: blockTrees,
      });
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: { command: string; args: any }) => {
      const command = message.command;
      const args = message.args;

      switch (command) {
        case "move":
          const src: BlockLocation = args.src;
          const dst: BlockLocation = args.dst;
          const moveArgs: MoveItemArgs = {
            content: document.getText(),
            src_item: src,
            dst_item: dst,
            //@ts-expect-error
            item_types: getQueryStrings(document.languageId),
            //@ts-expect-error
            language: getDocLang(),
          };

          const response = await moveBlock(moveArgs);

          if (response.Err !== undefined) {
            vscode.window.showErrorMessage(`Failed to move block: ${response.Err}`);
          } else if (response.Ok !== undefined) {
            const newContent = response.Ok;

            const edit = new vscode.WorkspaceEdit();

            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newContent);

            await vscode.workspace.applyEdit(edit);
          }
          break;
      }
    }, undefined);

    await updateWebview();
  }

  /**
   * Get the static html used for the editor webviews.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // The CSS file from the Svelte build output
    const stylesUri = getUri(webview, this.context.extensionUri, [
      "webview-ui",
      "public",
      "build",
      "bundle.css",
    ]);
    // The JS file from the Svelte build output
    const scriptUri = getUri(webview, this.context.extensionUri, [
      "webview-ui",
      "public",
      "build",
      "bundle.js",
    ]);

    const nonce = getNonce();

    // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Hello World</title>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
          <link rel="stylesheet" type="text/css" href="${stylesUri}">
          <script defer nonce="${nonce}" src="${scriptUri}"></script>
        </head>
        <body>
        </body>
      </html>
    `;
  }

  /**
   * Add a new scratch to the current document.
   */
  private addNewScratch(document: vscode.TextDocument) {
    const json = this.getDocumentAsJson(document);
    const character =
      CodeBlocksEditorProvider.scratchCharacters[
        Math.floor(Math.random() * CodeBlocksEditorProvider.scratchCharacters.length)
      ];
    json.scratches = [
      ...(Array.isArray(json.scratches) ? json.scratches : []),
      {
        id: getNonce(),
        text: character,
        created: Date.now(),
      },
    ];

    return this.updateTextDocument(document, json);
  }

  /**
   * Delete an existing scratch from a document.
   */
  private deleteScratch(document: vscode.TextDocument, id: string) {
    const json = this.getDocumentAsJson(document);
    if (!Array.isArray(json.scratches)) {
      return;
    }

    json.scratches = json.scratches.filter((note: any) => note.id !== id);

    return this.updateTextDocument(document, json);
  }

  /**
   * Try to get a current document as json text.
   */
  private getDocumentAsJson(document: vscode.TextDocument): any {
    const text = document.getText();
    if (text.trim().length === 0) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Could not get document as json. Content is not valid json");
    }
  }

  /**
   * Write out the json to a given document.
   */
  private updateTextDocument(document: vscode.TextDocument, json: any) {
    const edit = new vscode.WorkspaceEdit();

    // Just replace the entire document every time for this example extension.
    // A more complete extension should compute minimal edits instead.
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(json, null, 2));

    return vscode.workspace.applyEdit(edit);
  }
}

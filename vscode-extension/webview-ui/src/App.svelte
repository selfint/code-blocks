<script lang="ts">
  import { provideVSCodeDesignSystem, vsCodeButton } from "@vscode/webview-ui-toolkit";
  import ContentTree from "./ContentTree.svelte";
  import type { BlockLocation, BlockLocationTree } from "./types";
  import { vscode } from "./utilities/vscode";

  // In order to use the Webview UI Toolkit web components they
  // must be registered with the browser (i.e. webview) using the
  // syntax below.
  provideVSCodeDesignSystem().register(vsCodeButton());

  // To register more toolkit components, simply import the component
  // registration function and call it from within the register
  // function, like so:
  //
  // provideVSCodeDesignSystem().register(
  //   vsCodeButton(),
  //   vsCodeCheckbox()
  // );
  //
  // Finally, if you would like to register all of the toolkit
  // components at once, there's a handy convenience function:
  //
  // provideVSCodeDesignSystem().register(allComponents.register());

  let text = "placeholder";
  let blockTrees = [];
  let selected: BlockLocation | undefined = undefined;

  window.addEventListener(
    "message",
    (event: MessageEvent<{ type: string; text: string; blockTrees: BlockLocationTree[] }>) => {
      text = event.data.text;
      blockTrees = event.data.blockTrees;
    }
  );

  function setSelected(block: BlockLocation): void {
    if (selected === undefined) {
      selected = block;
    } else {
      vscode.postMessage({
        command: "move",
        args: {
          src: selected,
          dst: block,
        },
      });
      selected = undefined;
    }
  }
</script>

<main>
  <ContentTree {blockTrees} {text} {selected} onClickHandler={setSelected} />
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    height: 100%;
  }
</style>

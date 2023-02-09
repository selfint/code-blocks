<script lang="ts">
  import { provideVSCodeDesignSystem, vsCodeButton } from "@vscode/webview-ui-toolkit";
  import ContentTree from "./ContentTree.svelte";
  import type { BlockLocation, BlockLocationTree } from "./types";
  import { vscode } from "./utilities/vscode";

  provideVSCodeDesignSystem().register(vsCodeButton());

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

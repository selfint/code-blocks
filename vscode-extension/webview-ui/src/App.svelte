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

  function handleBlockClicked(block: BlockLocation): void {
    if (selected === undefined) {
      selected = block;
    } else if (selected === block) {
      selected = undefined;
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
  <ContentTree {blockTrees} {text} {selected} onClickHandler={handleBlockClicked} />
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    height: 100%;
    margin: 10px;
    padding: 0 var(--container-padding);
    color: var(--vscode-foreground);
    font-size: var(--vscode-font-size);
    font-weight: var(--vscode-font-weight);
    font-family: var(--vscode-font-family);
  }
</style>

<script lang="ts">
  import Tree from "./Tree.svelte";
  import type { BlockLocation, BlockLocationTree, MoveCommand, UpdateMessage } from "./types";
  import { vscode } from "./utilities/vscode";

  let text: string | undefined = undefined;
  let blockTrees: BlockLocationTree[] | undefined = undefined;
  let selectedBlock: BlockLocation | undefined = undefined;

  function handleMessage(message: MessageEvent<UpdateMessage>) {
    text = message.data.text;
    blockTrees = message.data.blockTrees;
  }

  window.addEventListener("message", handleMessage);

  function handleBlockClicked(block: BlockLocation): void {
    if (selectedBlock === undefined) {
      selectedBlock = block;
    } else if (selectedBlock === block) {
      selectedBlock = undefined;
    } else {
      const moveCommand: MoveCommand = {
        command: "move",
        args: {
          src: selectedBlock,
          dst: block,
        },
      };
      vscode.postMessage(moveCommand);

      selectedBlock = undefined;
    }
  }
</script>

<main>
  {#if blockTrees === undefined || blockTrees.length === 0}
    <div>No blocks available.</div>
  {:else}
    <div>
      {text.substring(0, blockTrees[0].block.start_byte)}
      {#each blockTrees as tree}
        <Tree {text} {tree} onClick={handleBlockClicked} {selectedBlock} />
      {/each}
      {text.substring(blockTrees[blockTrees.length - 1].block.end_byte, text.length)}
    </div>
  {/if}
</main>

<style>
  main {
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    font-weight: var(--vscode-font-weight);
  }
</style>

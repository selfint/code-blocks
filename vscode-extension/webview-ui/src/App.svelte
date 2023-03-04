<script lang="ts">
  import Tree from "./Tree.svelte";
  import type { BlockLocation, BlockLocationTree } from "./types";
  import type { MoveCommand, UpdateMessage } from "./messages";
  import { vscode } from "./utilities/vscode";
  import { textSlice } from "./utilities/textSlice";

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

  const sliceLengthLimit = 10000;
</script>

{#if blockTrees === undefined}
  <div>No blocks available.</div>
{:else}
  <div class="block">
    {textSlice(0, blockTrees[0].block.startByte, text, sliceLengthLimit, true, 0)}
    {#each blockTrees as tree, i}
      <Tree
        {text}
        {tree}
        onClick={handleBlockClicked}
        {selectedBlock}
        {sliceLengthLimit}
      />{#if i !== blockTrees.length - 1}{textSlice(
          tree.block.endByte,
          blockTrees[i + 1].block.startByte,
          text,
          sliceLengthLimit,
          true,
          tree.block.startCol
        )}{/if}
    {/each}
    {textSlice(blockTrees.at(-1).block.endByte, text.length, text, sliceLengthLimit, true, 0)}
  </div>
{/if}

<style>
  :global(.block) {
    border-color: var(--vscode-editorIndentGuide-background);
    border-style: solid;
    border-width: 1px;
    white-space: pre-wrap;
    /* font-family: var(--vscode-font-family); */
    font-family: monospace, monospace;
    font-size: var(--vscode-font-size);
    font-weight: var(--vscode-font-weight);
    margin-top: 5px;
    margin-left: 5px;
    margin-bottom: 5px;
    padding: 5px;
    text-align: left;
  }
</style>

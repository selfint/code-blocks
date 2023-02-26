<script lang="ts">
  import Tree from "./Tree.svelte";
  import type { BlockLocation, BlockLocationTree } from "./types";
  import type { MoveCommand, UpdateMessage } from "./messages";
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

  const sliceLengthLimit = 100;
  function textSlice(start: number, end: number): string {
    if (end - start < sliceLengthLimit) {
      return text.substring(start, end);
    } else {
      return (
        text.substring(start, start + sliceLengthLimit / 2) +
        "..." +
        text.substring(end - sliceLengthLimit / 2, end)
      );
    }
  }
</script>

{#if blockTrees === undefined || blockTrees.length === 0}
  <div>No blocks available.</div>
{:else}
  <div class="block">
    {text.substring(0, blockTrees[0].block.startByte)}
    {#each blockTrees as tree, i}
      <Tree {text} {tree} onClick={handleBlockClicked} {selectedBlock} />
      {#if i !== blockTrees.length - 1}
        <div>
          {textSlice(tree.block.endByte, blockTrees[i + 1].block.startByte)}
        </div>
      {/if}
    {/each}
    {text.substring(blockTrees.at(-1).block.endByte, text.length)}
  </div>
{/if}

<style>
  :global(.block) {
    border-color: var(--vscode-editorIndentGuide-background);
    border-style: solid;
    border-width: 1px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    font-weight: var(--vscode-font-weight);
    margin-top: 5px;
    margin-left: 5px;
    margin-bottom: 5px;
    padding: 5px;
    text-align: left;
  }
</style>

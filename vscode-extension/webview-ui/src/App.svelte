<script lang="ts">
  import Tree from "./Tree.svelte";
  import Text from "./Text.svelte";
  import type { BlockLocation, BlockLocationTree } from "./types";
  import type { MoveCommand, UpdateMessage } from "./messages";
  import { vscode } from "./utilities/vscode";

  let text: string | undefined = undefined;
  let blockTrees: BlockLocationTree[] | undefined = undefined;
  let selectedBlock: BlockLocation | undefined = undefined;

  window.addEventListener("message", (message: MessageEvent<UpdateMessage>) => {
    text = message.data.text;
    blockTrees = message.data.blockTrees;
  });

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

{#if blockTrees === undefined}
  <div>No blocks available.</div>
{:else}
  <span>
    <Text text={text.substring(0, blockTrees[0].block.startByte)} />
    {#each blockTrees as tree, i}
      <Tree {text} {tree} onClick={handleBlockClicked} {selectedBlock} parentSelected={false} />
      {#if i !== blockTrees.length - 1}
        <Text text={text.substring(tree.block.endByte, blockTrees[i + 1].block.startByte)} />
      {/if}
    {/each}
    <Text text={text.substring(blockTrees.at(-1).block.endByte, text.length)} />
  </span>
{/if}

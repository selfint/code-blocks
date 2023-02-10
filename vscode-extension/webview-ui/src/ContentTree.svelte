<script lang="ts">
  import Tree from "./Tree.svelte";
  import type { BlockLocation, BlockLocationTree } from "./types";

  export let text: string;
  export let blockTrees: BlockLocationTree[];
  export let onClickHandler: (block: BlockLocation) => void;
  export let selected: BlockLocation | undefined;
</script>

<main>
  {#if blockTrees.length !== 0}
    <div>
      {text.substring(0, blockTrees[0].block.start_byte)}
      {#each blockTrees as tree}
        <Tree {text} {tree} {onClickHandler} {selected} />
      {/each}
      {text.substring(blockTrees[blockTrees.length - 1].block.end_byte, text.length)}
    </div>
  {:else}
    <div>No blocks available.</div>
  {/if}
</main>

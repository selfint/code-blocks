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
    <div class="block">
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

<style>
  .block {
    border-color: white;
    border-width: 1px;
    border-style: solid;
    margin-left: 10px;
    margin-top: 5px;
    margin-bottom: 5px;
    text-align: left;
    padding: 5px;
  }
</style>

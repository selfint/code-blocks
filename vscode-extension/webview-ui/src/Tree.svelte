<script lang="ts">
  import type { BlockLocation, BlockLocationTree } from "./types";

  export let text: string;
  export let tree: BlockLocationTree;
  export let onClickHandler: (block: BlockLocation) => void;
  export let selected: BlockLocation | undefined;

  $: borderColor = tree.block === selected ? "cadetblue" : "white";
</script>

<div
  class="block"
  style="border-color: {borderColor}"
  on:click|self|preventDefault={() => onClickHandler(tree.block)}
  on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
>
  {#if tree.children.length !== 0}
    <div
      on:click|self|preventDefault={() => onClickHandler(tree.block)}
      on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
    >
      {text.substring(tree.block.start_byte, tree.children[0].block.start_byte)}
    </div>
    {#each tree.children as childTree, i}
      <svelte:self {text} tree={childTree} {onClickHandler} {selected} />
      {#if i !== tree.children.length - 1}
        <div
          on:click|self|preventDefault={() => onClickHandler(tree.block)}
          on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
        >
          {text.substring(tree.children[i].block.end_byte, tree.children[i + 1].block.start_byte)}
        </div>
      {/if}
    {/each}
    <div
      on:click|self|preventDefault={() => onClickHandler(tree.block)}
      on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
    >
      {text.substring(tree.children[tree.children.length - 1].block.end_byte, tree.block.end_byte)}
    </div>
  {:else}
    {text.substring(tree.block.start_byte, tree.block.end_byte)}
  {/if}
</div>

<style>
  .block {
    border-width: 1px;
    border-style: solid;
    margin-left: 10px;
    margin-top: 5px;
    margin-bottom: 5px;
    text-align: left;
    padding: 5px;
  }
</style>

<script lang="ts">
  import type { BlockLocation, BlockLocationTree } from "./types";

  export let text: string;
  export let tree: BlockLocationTree;
  export let onClickHandler: (block: BlockLocation) => void;
  export let selected: BlockLocation | undefined;

  $: blockSelected = tree.block === selected;
  $: borderColor = blockSelected ? "var(--vscode-focusBorder)" : "var(--vscode-input-border)";

  const substringSizeLimit = 100;
  const expandOnClick = false;

  function getSubstring(start: number, end: number, blockSelected: boolean): string {
    if (end - start < substringSizeLimit || (blockSelected && expandOnClick)) {
      return text.substring(start, end);
    } else {
      return (
        text.substring(start, start + substringSizeLimit / 2) +
        "..." +
        text.substring(end - substringSizeLimit / 2, end)
      );
    }
  }
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
      {getSubstring(tree.block.start_byte, tree.children[0].block.start_byte, blockSelected)}
    </div>
    {#each tree.children as childTree, i}
      <svelte:self {text} tree={childTree} {onClickHandler} {selected} />
      {#if i !== tree.children.length - 1}
        <div
          on:click|self|preventDefault={() => onClickHandler(tree.block)}
          on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
        >
          {getSubstring(
            tree.children[i].block.end_byte,
            tree.children[i + 1].block.start_byte,
            blockSelected
          )}
        </div>
      {/if}
    {/each}
    <div
      on:click|self|preventDefault={() => onClickHandler(tree.block)}
      on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
    >
      {getSubstring(
        tree.children[tree.children.length - 1].block.end_byte,
        tree.block.end_byte,
        blockSelected
      )}
    </div>
  {:else}
    {getSubstring(tree.block.start_byte, tree.block.end_byte, blockSelected)}
  {/if}
</div>

<style>
  .block {
    margin: 5px;
    text-align: left;
    padding: 5px;
    border-color: var(--vscode-input-border);
    border-width: 1px;
    border-style: solid;
    display: block;
    color: var(--vscode-input-foreground);
    outline-color: var(--vscode-input-border);
    font-size: var(--vscode-font-size);
    font-weight: var(--vscode-font-weight);
    font-family: var(--vscode-font-family);
  }
</style>

<script lang="ts">
  import { children } from "svelte/internal";
  import type { BlockLocation, BlockLocationTree } from "./types";

  export let text: string;
  export let tree: BlockLocationTree;
  export let onClickHandler: (block: BlockLocation) => void;
  export let selectedBlock: BlockLocation | undefined;

  const selectedColor = "var(--vscode-editor-selectionBackground)";
  const defaultColor = "var(--vscode-editor-background)";

  $: backgroundColor = tree.block === selectedBlock ? selectedColor : defaultColor;

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

<main>
  <div
    class="block"
    style="background-color: {backgroundColor}"
    on:click|self|preventDefault={() => onClickHandler(tree.block)}
    on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
  >
    {#if tree.children.length !== 0}
      <div
        on:click|self|preventDefault={() => onClickHandler(tree.block)}
        on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
      >
        {textSlice(tree.block.start_byte, tree.children[0].block.start_byte)}
      </div>
      {#each tree.children as childTree, i}
        <svelte:self {text} tree={childTree} {onClickHandler} {selectedBlock} />
        {#if i !== tree.children.length - 1}
          <div
            on:click|self|preventDefault={() => onClickHandler(tree.block)}
            on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
          >
            {textSlice(tree.children[i].block.end_byte, tree.children[i + 1].block.start_byte)}
          </div>
        {/if}
      {/each}
      <div
        on:click|self|preventDefault={() => onClickHandler(tree.block)}
        on:keypress|self|preventDefault={() => onClickHandler(tree.block)}
      >
        {textSlice(tree.children.at(-1).block.end_byte, tree.block.end_byte)}
      </div>
    {:else}
      {textSlice(tree.block.start_byte, tree.block.end_byte)}
    {/if}
  </div>
</main>

<style>
  .block {
    background-color: var(--vscode-editor-background);
    border-color: var(--vscode-editorIndentGuide-background);
    border-style: solid;
    border-width: 1px;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    font-weight: var(--vscode-font-weight);
    margin: 5px;
    padding: 5px;
    text-align: left;
  }
</style>

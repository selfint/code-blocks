<script lang="ts">
  import type { BlockLocation, BlockLocationTree } from "./types";

  export let text: string;
  export let tree: BlockLocationTree;
  export let onClick: (block: BlockLocation) => void;
  export let selectedBlock: BlockLocation | undefined;
  export let sliceLengthLimit: number;

  const selectedBgColor = "var(--vscode-editor-selectionBackground)";
  const selectedFgColor = "var(--vscode-editor-selectionForeground)";
  const defaultBgColor = "var(--vscode-editor-background)";
  const defaultFgColor = "var(--vscode-editor-foreground)";

  $: backgroundColor = tree.block === selectedBlock ? selectedBgColor : defaultBgColor;
  $: foregroundColor = tree.block === selectedBlock ? selectedFgColor : defaultFgColor;

  // const sliceLengthLimit = 500;
  function textSlice(start: number, end: number): string {
    console.log(`Slice limit: ${sliceLengthLimit}`);
    if (end - start < sliceLengthLimit) {
      return text.substring(start, end);
    } else {
      return (
        text.substring(start, start + (sliceLengthLimit * 3) / 4) +
        "..." +
        text.substring(end - sliceLengthLimit / 4, end)
      );
    }
  }
</script>

<div
  class="block"
  style="color: {foregroundColor}; background-color: {backgroundColor}"
  on:click|stopPropagation|preventDefault={() => onClick(tree.block)}
  on:keypress|stopPropagation|preventDefault={() => onClick(tree.block)}
>
  {#if tree.children.length !== 0}
    {textSlice(tree.block.startByte, tree.children[0].block.startByte)}
    {#each tree.children as childTree, i}
      <svelte:self {text} tree={childTree} {onClick} {selectedBlock} {sliceLengthLimit} />
      {#if i !== tree.children.length - 1}
        {textSlice(tree.children[i].block.endByte, tree.children[i + 1].block.startByte)}
      {/if}
    {/each}
    {textSlice(tree.children.at(-1).block.endByte, tree.block.endByte)}
  {:else}
    {textSlice(tree.block.startByte, tree.block.endByte)}
  {/if}
</div>

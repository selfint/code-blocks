<script lang="ts">
  import type { BlockLocation, BlockLocationTree } from "./types";
  import { textSlice } from "./utilities/textSlice";

  export let text: string;
  export let tree: BlockLocationTree;
  export let onClick: (block: BlockLocation) => void;
  export let selectedBlock: BlockLocation | undefined;
  export let sliceLengthLimit: number;
  export let parentSelected: boolean;

  const selectedBgColor = "var(--vscode-editor-selectionBackground)";
  const selectedFgColor = "var(--vscode-editor-selectionForeground)";
  const defaultBgColor = "var(--vscode-editor-background)";
  const defaultFgColor = "var(--vscode-editor-foreground)";

  $: isSelected = tree.block === selectedBlock || parentSelected;
  $: backgroundColor = isSelected ? selectedBgColor : defaultBgColor;
  $: foregroundColor = isSelected ? selectedFgColor : defaultFgColor;
</script>

<span
  class="block"
  style="color: {foregroundColor}; background-color: {backgroundColor}"
  on:click|stopPropagation|preventDefault={() => onClick(tree.block)}
  on:keypress|stopPropagation|preventDefault={() => onClick(tree.block)}
  >{#if tree.children.length !== 0}{textSlice(
      tree.block.startByte,
      tree.children[0].block.startByte,
      text,
      sliceLengthLimit,
      true,
      tree.block.startCol
    )}{#each tree.children as childTree, i}
      <svelte:self
        {text}
        tree={childTree}
        {onClick}
        {selectedBlock}
        {sliceLengthLimit}
        parentSelected={isSelected}
      />{#if i !== tree.children.length - 1}{textSlice(
          tree.children[i].block.endByte,
          tree.children[i + 1].block.startByte,
          text,
          sliceLengthLimit,
          true,
          tree.children[i].block.startCol
        )}
      {/if}{/each}{textSlice(
      tree.children.at(-1).block.endByte,
      tree.block.endByte,
      text,
      sliceLengthLimit,
      true,
      tree.children.at(-1).block.startCol
    )}{:else}{textSlice(
      tree.block.startByte,
      tree.block.endByte,
      text,
      sliceLengthLimit,
      true,
      tree.block.startCol
    )}{/if}</span
>

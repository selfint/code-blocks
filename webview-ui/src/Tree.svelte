<script lang="ts">
  import Text from "./Text.svelte";
  import type { BlockLocation, BlockLocationTree } from "./types";

  export let text: string;
  export let tree: BlockLocationTree;
  export let onClick: (block: BlockLocation) => void;
  export let selectedBlock: BlockLocation | undefined;
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
  style="color: {foregroundColor}; background-color: {backgroundColor}"
  class="tree"
  role="button"
  tabindex="0"
  on:click|stopPropagation|preventDefault={() => onClick(tree.block)}
  on:keypress|stopPropagation|preventDefault={() => onClick(tree.block)}
>
  {#if tree.children.length !== 0}
    <Text text={text.substring(tree.block.startByte, tree.children[0].block.startByte)} />
    {#each tree.children as childTree, i}
      <svelte:self {text} tree={childTree} {onClick} {selectedBlock} parentSelected={isSelected} />
      {#if i !== tree.children.length - 1}
        <Text text={text.substring(tree.children[i].block.endByte, tree.children[i + 1].block.startByte)} />
      {/if}
    {/each}
    <Text text={text.substring(tree.children.at(-1).block.endByte, tree.block.endByte)} />
  {:else}
    <Text text={text.substring(tree.block.startByte, tree.block.endByte)} />
  {/if}
</span>

<style>
  .tree {
    outline-color: var(--vscode-editorIndentGuide-background);
    outline-style: solid;
    outline-width: 1px;
    padding: 2px 2px;
  }
</style>

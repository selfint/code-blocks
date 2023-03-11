<script lang="ts">
  export let text: string;
</script>

<span class="text">{text}</span>

<style>
  .text {
    font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size);
    font-weight: var(--vscode-editor-font-weight);
    white-space: pre-wrap;
  }
</style>

import { Component, createSignal, Show } from "solid-js";
import "./App.css";
import { UpdateMessage, MoveCommand } from "./messages";
import { BlockLocationTree, BlockLocation } from "./types";
import { vscode } from "./utilities/vscode";

type State = {
  text: string;
  blockTrees: BlockLocationTree[];
};

const App: Component = () => {
  let [getSelectedBlock, setSelectedBlock] = createSignal<BlockLocation | undefined>();
  let [getState, setState] = createSignal<State | undefined>();

  window.addEventListener("message", (message: MessageEvent<UpdateMessage>) => {
    setState({
      text: message.data.text,
      blockTrees: message.data.blockTrees,
    });
  });

  function handleBlockClicked(block: BlockLocation): void {
    const selectedBlock = getSelectedBlock();

    if (selectedBlock === undefined) {
      setSelectedBlock(block);
    } else if (selectedBlock === block) {
      setSelectedBlock(undefined);
    } else {
      const moveCommand: MoveCommand = {
        command: "move",
        args: {
          src: selectedBlock,
          dst: block,
        },
      };
      vscode.postMessage(moveCommand);

      setSelectedBlock(undefined);
    }
  }

  /*
    {text.substring(0, blockTrees[0].block.startByte)}{#each blockTrees as tree, i}<Tree
        {text}
        {tree}
        onClick={handleBlockClicked}
        {selectedBlock}
        parentSelected={false}
      />{#if i !== blockTrees.length - 1}{text.substring(
          tree.block.endByte,
          blockTrees[i + 1].block.startByte
        )}{/if}{/each}{text.substring(blockTrees.at(-1).block.endByte, text.length)}
  */

  const state = getState();
  const { text, blockTrees } = state ?? { text: undefined, blockTrees: undefined };

  return (
    <main>
      <Show when={state !== undefined} fallback={<div>No blocks available.</div>}>
        <h1>Hello world!</h1>
        <div>{text!.substring(0, blockTrees![0].block.startByte)}</div>
        <span class="code-block"></span>
      </Show>
    </main>
  );
};

export default App;

import { Component, createSignal, For, Show } from "solid-js";
import "./App.css";
import { UpdateMessage, MoveCommand } from "./messages";
import TextSlice from "./TextSlice";
import Tree from "./Tree";
import { BlockLocationTree, BlockLocation } from "./types";
import { vscode } from "./utilities/vscode";

type State = {
  text: string;
  blockTrees: BlockLocationTree[];
};

const App: Component = () => {
  let [selectedBlock, setSelectedBlock] = createSignal<BlockLocation | undefined>();
  let [state, setState] = createSignal<State | undefined>();

  window.addEventListener("message", (message: MessageEvent<UpdateMessage>) => {
    console.log(message);
    setState({
      text: message.data.text,
      blockTrees: message.data.blockTrees,
    });
  });

  function handleBlockClicked(block: BlockLocation): void {
    const _selectedBlock = selectedBlock();

    if (_selectedBlock === undefined) {
      setSelectedBlock(block);
    } else if (_selectedBlock === block) {
      setSelectedBlock(undefined);
    } else {
      const moveCommand: MoveCommand = {
        command: "move",
        args: {
          src: _selectedBlock,
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

  return (
    <main>
      <Show when={state() !== undefined} fallback={<div>No blocks available.</div>}>
        <TextSlice text={state()!.text.substring(0, state()!.blockTrees[0].block.startByte)} />
        <For each={state()!.blockTrees}>
          {(tree, i) => (
            <>
              <Tree
                text={state()!.text}
                tree={tree}
                onClick={handleBlockClicked}
                parentSelected={false}
                selectedBlock={selectedBlock()}
              />
              <Show when={i() !== state()!.blockTrees.length - 1}>
                <TextSlice
                  text={state()!.text.substring(
                    tree.block.endByte,
                    state()!.blockTrees[i() + 1].block.startByte
                  )}
                />
              </Show>
            </>
          )}
        </For>
      </Show>
    </main>
  );
};

export default App;

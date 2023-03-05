import { JSX } from "solid-js";
import TextSlice from "./TextSlice";
import { BlockLocation, BlockLocationTree } from "./types";

export type TreeProps = {
  text: string;
  tree: BlockLocationTree;
  onClick: (block: BlockLocation) => void;
  selectedBlock: BlockLocation | undefined;
  parentSelected: boolean;
};

export default function Tree(props: TreeProps): JSX.Element {
  const selectedBgColor = "var(--vscode-editor-selectionBackground)";
  const selectedFgColor = "var(--vscode-editor-selectionForeground)";
  const defaultBgColor = "var(--vscode-editor-background)";
  const defaultFgColor = "var(--vscode-editor-foreground)";

  const isSelected = props.tree.block === props.selectedBlock || props.parentSelected;
  const backgroundColor = isSelected ? selectedBgColor : defaultBgColor;
  const foregroundColor = isSelected ? selectedFgColor : defaultFgColor;

  return <span>hello world</span>;
}

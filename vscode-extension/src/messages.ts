import { BlockLocation, BlockLocationTree } from "./codeBlocks/types";

export type UpdateMessage = {
  type: "update";
  text: string;
  blockTrees: BlockLocationTree[];
};

export type MoveCommand = {
  command: "move";
  args: {
    src: BlockLocation;
    dst: BlockLocation;
    force: boolean;
  };
};

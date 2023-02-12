import type { BlockLocationTree, BlockLocation } from "./types";

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
  };
};

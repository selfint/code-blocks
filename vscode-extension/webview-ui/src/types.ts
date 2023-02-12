/// <reference types="svelte" />

export type BlockLocation = {
  start_byte: number;
  end_byte: number;
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
};

export type BlockLocationTree = {
  block: BlockLocation;
  children: BlockLocationTree[];
};

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

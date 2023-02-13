/// <reference types="svelte" />

export type BlockLocation = {
  startByte: number;
  endByte: number;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export type BlockLocationTree = {
  block: BlockLocation;
  children: BlockLocationTree[];
};

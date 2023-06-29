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

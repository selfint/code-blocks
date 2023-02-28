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

export type GetSubtreesArgs = {
  queries: string[];
  text: string;
  language: Dynamic;
};

export type GetSubtreesResponse = BlockLocationTree[];

export type MoveBlockArgs = {
  queries: string[];
  text: string;
  language: Dynamic;
  srcBlock: BlockLocation;
  dstBlock: BlockLocation;
};

export type MoveBlockResponse = string;

export type MethodCall =
  | {
      method: "getSubtrees";
      params: GetSubtreesArgs;
    }
  | {
      method: "moveBlock";
      params: MoveBlockArgs;
    };

export type JsonResult<T> =
  | {
      status: "ok";
      result: T;
    }
  | {
      status: "error";
      result: string;
    };

export type Dynamic = {
  dynamic: {
    downloadCmd: string;
    symbol: string;
    name: string;
    installDir: string;
  };
};

export type ParserInstaller = {
  downloadCmd: string;
  symbol: string;
  name: string;
};

export type Query = string;

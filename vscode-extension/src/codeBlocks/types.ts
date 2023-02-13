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
  language: SupportedLanguage;
};

export type GetSubtreesResponse = BlockLocationTree[];

export type MoveItemArgs = {
  queries: string[];
  text: string;
  language: SupportedLanguage;
  srcBlock: BlockLocation;
  dstBlock: BlockLocation;
};

export type MoveItemResponse = string;

export type JsonResult<T> =
  | {
      status: "ok";
      result: T;
    }
  | {
      status: "error";
      result: string;
    };

export const SUPPORTED_LANGUAGES = ["rust", "typescript", "tsx", "typescriptreact", "svelte"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

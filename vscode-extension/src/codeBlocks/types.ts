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

export type MoveBlockArgs = {
  queries: string[];
  text: string;
  language: SupportedLanguage;
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

export const SUPPORTED_DYNAMIC_LANGUAGES = ["rust", "typescript", "tsx", "svelte", "python"] as const;
export type SupportedDynamicLanguage = (typeof SUPPORTED_DYNAMIC_LANGUAGES)[number];

export type SupportedDynamic = {
  supportedDynamic: {
    language: SupportedDynamicLanguage;
    installDir: string;
  };
};

export type Dynamic = {
  dynamic: {
    downloadCmd: string;
    symbol: string;
    name: string;
    installDir: string;
  };
};

export const SUPPORTED_LANGUAGES = ["rust", "typescript", /* "tsx", */ "svelte", "python"] as const;
export type SupportedLanguage =
  | "rust"
  | "typescript"
  // | "tsx"
  | "svelte"
  | "python"
  | SupportedDynamic
  | Dynamic;

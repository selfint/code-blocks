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

export type InstallLanguageArgs = {
  downloadCmd: string;
  libraryName: string;
  installDir: string;
};

export type InstallLanguageProgress = "Downloading" | "Patching" | "Compiling";

export type InstallLanguageResponse = string;

export type GetSubtreesArgs = {
  queries: string[];
  text: string;
  libraryPath: string;
  languageFnSymbol: string;
};

export type GetSubtreesResponse = BlockLocationTree[];

export type MoveBlockArgs = {
  queries: string[];
  text: string;
  libraryPath: string;
  languageFnSymbol: string;
  srcBlock: BlockLocation;
  dstBlock: BlockLocation;
  force: boolean;
};

export type MoveBlockResponse = {
  text: string;
  newSrcStart: number;
};

export type CliRequest =
  | {
    method: "installLanguage";
    params: InstallLanguageArgs;
  }
  | {
    method: "getSubtrees";
    params: GetSubtreesArgs;
  }
  | {
    method: "moveBlock";
    params: MoveBlockArgs;
  };

export type CliResponse = InstallLanguageResponse | GetSubtreesResponse | MoveBlockResponse;

export type JsonResult<T> =
  | {
    status: "ok";
    result: T;
  }
  | {
    status: "progress";
    result: string;
  }
  | {
    status: "error";
    result: string;
  };

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

export type GetSubtreesArgs = {
  items: string[];
  content: string;
  language: SupportedLanguage;
};

export type GetSubtreesResponse = BlockLocationTree[];

export type MoveItemArgs = {
  item_types: string[];
  src_item: BlockLocation;
  dst_item: BlockLocation;
  content: string;
  language: SupportedLanguage;
};

export type MoveItemResponse = {
  Ok: string | undefined;
  Err: string | undefined;
};

export const SUPPORTED_LANGUAGES = ["rust", "typescript", "tsx", "typescriptreact", "svelte"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

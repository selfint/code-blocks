export type BlockLocation = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  start_byte: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  end_byte: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  start_row: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  start_col: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  end_row: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  item_types: string[];
  // eslint-disable-next-line @typescript-eslint/naming-convention
  src_item: BlockLocation;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  dst_item: BlockLocation;
  content: string;
  language: SupportedLanguage;
};

export type MoveItemResponse = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Ok: string | undefined;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Err: string | undefined;
};

export const SUPPORTED_LANGUAGES = ["rust", "typescript", "tsx", "typescriptreact", "svelte"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

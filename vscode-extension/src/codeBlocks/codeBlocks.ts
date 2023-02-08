import axios from "axios";

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

const GET_SUBTREES_ENDPOINT = "http://localhost:8000/get_subtrees";
export async function getBlockTrees(args: GetSubtreesArgs): Promise<BlockLocationTree[]> {
  if (args.language === "typescriptreact") {
    args.language = "tsx";
  }

  const response = await axios({
    url: GET_SUBTREES_ENDPOINT,
    method: "POST",
    data: args,
  });

  return response.data;
}

const MOVE_ITEM_ENDPOINT = "http://localhost:8000/move_item";
export async function moveBlock(args: MoveItemArgs): Promise<MoveItemResponse> {
  if (args.language === "typescriptreact") {
    args.language = "tsx";
  }

  const response = await axios({
    url: MOVE_ITEM_ENDPOINT,
    method: "POST",
    data: args,
  });

  return response.data;
}

export const SUPPORTED_LANGUAGES = ["rust", "typescript", "tsx", "typescriptreact"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export function getQueryStrings(lang: SupportedLanguage): string[] {
  switch (lang) {
    case "rust":
      return [
        `
      (
          (
              [
                  (attribute_item)
                  (line_comment)
              ] @header
              .
              [
                  (attribute_item)
                  (line_comment)
              ]* @header
          )?
          .
          (function_item) @item
      )
      `,
        `
      (
          (
              [
                  (attribute_item)
                  (line_comment)
              ] @header
              .
              [
                  (attribute_item)
                  (line_comment)
              ]* @header
          )?
          .
          (mod_item) @item
      )
      `,
        `
      (
          (
              [
                  (attribute_item)
                  (line_comment)
              ] @header
              .
              [
                  (attribute_item)
                  (line_comment)
              ]* @header
          )?
          .
          (struct_item) @item
      )
      `,
        `(impl_item) @item`,
      ];
    case "typescript":
      return [
        `
(
  (comment)* @header
  .
  (class_declaration) @item
)
        `,
        `
(
  (comment)* @header
  .
  (method_definition) @item
)
        `,
        `
(
  (comment)* @header
  .
  (function_declaration) @item
)
        `,
        `
(
  (comment)* @header
  .
  (export_statement) @item
)
        `,
      ];
    case "tsx":
      const typescriptQueries = getQueryStrings("typescript");
      const tsxQueries = [`(jsx_element) @item`, "(jsx_self_closing_element) @item"];
      return [...typescriptQueries, ...tsxQueries];
    case "typescriptreact":
      return getQueryStrings("tsx");
  }
}

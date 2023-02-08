import { SupportedLanguage } from "./types";

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
    case "svelte":
      return [
        `
(
  (comment)* @header
  .
  (element) @item
)
        `,
        `
(
  (comment)* @header
  .
  (each_statement) @item
)
        `,
        `
(
  (comment)* @header
  .
  (if_statement) @item
)
        `,
        `
(
  (comment)* @header
  .
  (style_element) @item
)
        `,
        `
(
  (comment)* @header
  .
  (script_element) @item
)
        `,
      ];
  }
}

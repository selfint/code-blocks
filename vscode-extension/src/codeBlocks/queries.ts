import { SupportedDynamic, SupportedLanguage } from "./types";
import queryStrings from "./queryStrings.json";

export function getQueryStrings(lang: SupportedLanguage): string[] {
  if (typeof lang === "string") {
    switch (lang) {
      case "rust":
        return queryStrings["rust"];
      case "typescript":
        return queryStrings["typescript"];
      case "tsx":
        return [...queryStrings["typescript"], ...queryStrings["tsx"]];
      case "svelte":
        return queryStrings["svelte"];
      case "python":
        return queryStrings["python"];
    }
  } else if (typeof lang === "object") {
    if (lang.hasOwnProperty("supporteddynamic")) {
      switch ((lang as SupportedDynamic).supporteddynamic.language) {
        case "rust":
          return queryStrings["rust"];
        case "typescript":
          return queryStrings["typescript"];
        case "tsx":
          return [...queryStrings["typescript"], ...queryStrings["tsx"]];
        case "svelte":
          return queryStrings["svelte"];
        case "python":
          return queryStrings["python"];
        default:
          throw new Error(`unreachable - unknown supporteddynamic lang '${lang}'`);
      }
    } else if (lang.hasOwnProperty("dynamic")) {
      return [];
    } else {
      throw new Error("unreachable - lang has unknown object type");
    }
  } else {
    throw new Error("unreachable - lang is not string/object");
  }
}

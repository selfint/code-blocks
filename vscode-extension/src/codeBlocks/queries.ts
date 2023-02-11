import { SupportedLanguage } from "./types";
import queriesStringsJson from "./queryStrings.json";

export function getQueryStrings(lang: SupportedLanguage): string[] {
  switch (lang) {
    case "rust":
      return queriesStringsJson["rust"];
    case "typescript":
      return queriesStringsJson["typescript"];
    case "tsx":
      return [...queriesStringsJson["typescript"], ...queriesStringsJson["tsx"]];
    case "typescriptreact":
      return getQueryStrings("tsx");
    case "svelte":
      return queriesStringsJson["svelte"];
  }
}

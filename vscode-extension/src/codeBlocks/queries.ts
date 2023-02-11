import { SupportedLanguage } from "./types";
import gueryStrings from "./queryStrings.json";

export function getQueryStrings(lang: SupportedLanguage): string[] {
  switch (lang) {
    case "rust":
      return gueryStrings["rust"];
    case "typescript":
      return gueryStrings["typescript"];
    case "tsx":
      return [...gueryStrings["typescript"], ...gueryStrings["tsx"]];
    case "typescriptreact":
      return getQueryStrings("tsx");
    case "svelte":
      return gueryStrings["svelte"];
  }
}

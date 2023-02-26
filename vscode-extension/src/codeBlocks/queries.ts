import { SupportedLanguage } from "./types";
import queryStrings from "./queryStrings.json";

export function getQueryStrings(lang: SupportedLanguage): string[] {
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
}

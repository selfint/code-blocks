import { Dynamic, SupportedDynamic, SupportedLanguage } from "./types";
import queryStrings from "./queryStrings.json";

export function getQueryStrings(lang: SupportedLanguage): string[] {
  if (typeof lang === "string") {
    switch (lang) {
      case "rust":
        return queryStrings["rust"];
      case "typescript":
        return queryStrings["typescript"];
      // case "tsx":
      //   return [...queryStrings["typescript"], ...queryStrings["tsx"]];
      case "svelte":
        return queryStrings["svelte"];
      case "python":
        return queryStrings["python"];
    }
  } else if ((lang as SupportedDynamic) !== null) {
    switch ((lang as SupportedDynamic).supportedDynamic.language) {
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
  } else if ((lang as Dynamic) !== null) {
    return [
      ...queryStrings["rust"],
      ...queryStrings["svelte"],
      ...queryStrings["typescript"],
      ...queryStrings["tsx"],
      ...queryStrings["python"],
    ];
  } else {
    throw new Error("unreachable");
  }
}

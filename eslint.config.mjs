import { defineConfig, globalIgnores } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default defineConfig([
    globalIgnores(["webview-ui/**/*", "**/.eslintrc.js"]),
    {
        extends: compat.extends(
            "eslint:recommended",
            "plugin:@typescript-eslint/recommended",
            "plugin:@typescript-eslint/recommended-requiring-type-checking",
            "plugin:@typescript-eslint/strict"
        ),

        plugins: {
            "@typescript-eslint": typescriptEslint,
        },

        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: "commonjs",

            parserOptions: {
                project: "tsconfig.json",
                tsconfigRootDir: __dirname,
            },
        },

        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_.*",
                },
            ],

            "@typescript-eslint/naming-convention": "warn",
            "@typescript-eslint/consistent-type-definitions": ["error", "type"],
            "curly": "warn",
            "eqeqeq": "warn",
            "no-throw-literal": "warn",
            "@typescript-eslint/explicit-function-return-type": "warn",
            "no-duplicate-imports": "warn",
            "sort-imports": "warn",
            "no-trailing-spaces": "warn",
        },
    },
]);

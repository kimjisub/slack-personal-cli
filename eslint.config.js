import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "smart"],
      "no-throw-literal": "error",
      // Best-effort credential extraction in auth.js deliberately swallows
      // failures from each probe and moves on to the next.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];

// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * ESLint flat config: recommended + strict typescript-eslint rules, plus project invariants
 * (no network modules, no child processes in source).
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", "test/fixtures/**", "examples/demo/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "node:http", message: "Architecture Check must not use the network." },
            { name: "node:https", message: "Architecture Check must not use the network." },
            { name: "node:net", message: "Architecture Check must not use the network." },
            { name: "node:child_process", message: "Architecture Check never starts processes." },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off", "no-restricted-imports": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  }
);

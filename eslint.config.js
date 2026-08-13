// @ts-check
const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // For source code, disable now, might enable in the future
      "no-useless-escape": "off",
      "prefer-const": "off",
      "no-prototype-builtins": "off",
      "no-useless-catch": "off",
      "no-case-declarations": "off",
      "no-fallthrough": "off",
      "no-control-regex": "off",
      "no-self-assign": "off",
      "no-unreachable": "off",
      "no-useless-assignment": "off",
      "no-constant-binary-expression": "off",
      // TypeScript handles undefined variable checking; disable ESLint's no-undef for TS files
      "no-undef": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-extra-semi": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
];

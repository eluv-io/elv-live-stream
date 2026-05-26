const skipWords = require("./spellcheck/spell-checker/skipWords.cjs");

module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  settings: { react: { version: "detect" } },
  plugins: ["react-refresh", "spellcheck"],
  overrides: [
    {
      files: ["**/*.test.js", "**/*.test.jsx", "**/test/setup.js"],
      rules: {
        "spellcheck/spell-checker": "off",
        "no-console": "off",
        "no-undef": "off"
      }
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      plugins: ["@typescript-eslint"],
      rules: {
        "no-undef": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": ["error", {argsIgnorePattern: "^_"}]
      }
    },
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "spellcheck/spell-checker": "off",
        "no-console": "off"
      }
    }
  ],
  rules: {
    "react-hooks/exhaustive-deps": 0,
    "react/prop-types": 0,
    "semi": ["error", "always", { "omitLastInOneLineClassBody": true }],
    "react-refresh/only-export-components": [
      'warn',
      { allowConstantExport: true },
    ],
    "no-console": [
      "error"
    ],
    "quotes": [
      "error",
      "double"
    ],
    "spellcheck/spell-checker": [1,
      {
        "lang": "en_US",
        "skipWords": skipWords
      }]
  },
}

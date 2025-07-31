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

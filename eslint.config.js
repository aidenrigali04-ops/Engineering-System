import js from "@eslint/js";

export default [
  {
    ignores: ["node_modules/**", "coverage/**"],
  },

  js.configs.recommended,

  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      // Equality without coercion. `==` has surprising corner cases that are
      // never worth the two saved keystrokes.
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",

      // Logging is fine in scripts, but in library code it is usually a
      // leftover from debugging.
      "no-console": "warn",
    },
  },

  {
    // Command line entry points are supposed to talk to the terminal and read
    // their arguments from the process.
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];

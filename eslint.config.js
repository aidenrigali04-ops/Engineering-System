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
    // Code that runs on Node rather than in a browser, so Node's globals exist.
    files: ["src/**/*.js", "scripts/**/*.js", "test/**/*.js"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
      },
    },
  },

  {
    // Entry points are supposed to talk to the terminal. Everything else
    // should hand information back to its caller instead of printing it.
    files: ["scripts/**/*.js", "src/server.js"],
    rules: {
      "no-console": "off",
    },
  },
];

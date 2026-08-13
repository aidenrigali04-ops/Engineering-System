import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "coverage/**", "dist/**"],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
    },
    rules: {
      // TypeScript resolves identifiers itself and knows about Node's globals
      // through @types/node. Leaving this on would report `process` and
      // `fetch` as undefined while the compiler is perfectly happy.
      "no-undef": "off",

      // Equality without coercion. `==` has surprising corner cases that are
      // never worth the two saved keystrokes.
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",

      // Logging is fine in scripts, but in library code it is usually a
      // leftover from debugging.
      "no-console": "warn",

      // An unused argument is often a signal that a function outgrew its
      // signature, but a leading underscore says the omission is deliberate.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // Entry points are supposed to talk to the terminal. Everything else
    // should hand information back to its caller instead of printing it.
    files: ["scripts/**/*.ts", "src/server.ts"],
    rules: {
      "no-console": "off",
    },
  },
);

import js from "@eslint/js";
import globals from "globals";

const foundryGlobals = [
  "ActiveEffect",
  "Actor",
  "Actors",
  "ActorSheet",
  "Application",
  "canvas",
  "ChatMessage",
  "Combatant",
  "CONFIG",
  "CONST",
  "Dialog",
  "Die",
  "FormApplication",
  "foundry",
  "fromUuid",
  "game",
  "Hooks",
  "Handlebars",
  "Item",
  "Items",
  "ItemSheet",
  "loadTemplates",
  "Macro",
  "MarvelMultiverse",
  "renderTemplate",
  "Roll",
  "SummonsData",
  "TextEditor",
  "ui",
  "$",
];

export default [
  {
    ignores: [
      "node_modules/**",
      "marvel-multiverse-compiled.mjs",
      "packs/**",
      "css/**",
      // Legacy pre-consolidation tree: not loaded by marvel-multiverse.mjs (only lib/ is).
      // Kept for reference until the remaining data-model parity work removes it.
      "module/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...Object.fromEntries(foundryGlobals.map((name) => [name, "readonly"])),
      },
    },
    rules: {
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

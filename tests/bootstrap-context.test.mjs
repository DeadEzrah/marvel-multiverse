import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bootstrap = await readFile(new URL("../lib/bootstrap.mjs", import.meta.url), "utf8");
const hooks = await readFile(new URL("../lib/hooks.mjs", import.meta.url), "utf8");
const entry = await readFile(new URL("../marvel-multiverse.mjs", import.meta.url), "utf8");
const system = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));

function extractRegisterCoreConfigNames() {
  const match = bootstrap.match(/export function registerCoreConfig\(context\) \{\s*const \{([^}]+)\} = context;/u);
  assert.ok(match, "registerCoreConfig must destructure its context");
  return match[1].split(",").map((name) => name.trim()).filter(Boolean);
}

test("hooks forward the complete context to initializeSystem", () => {
  // A hand-copied context subset once dropped DocumentMarvelMultiverseCampaignFramework,
  // registering an undefined Item data model and breaking world boot at i18n init.
  assert.match(hooks, /return initializeSystem\(context\);/u);
  assert.match(bootstrap, /registerCoreConfig\(context\);/u);
});

test("the entry module supplies every name registerCoreConfig consumes", () => {
  const registerCall = entry.match(/registerSystemHooks\(\{([^;]+)\}\);/u);
  assert.ok(registerCall, "the entry module must call registerSystemHooks with a context object");
  const provided = new Set(
    registerCall[1].split(",").map((part) => part.split(":")[0].trim()).filter(Boolean),
  );
  for (const name of extractRegisterCoreConfigNames()) {
    assert.ok(provided.has(name), `registerSystemHooks context is missing "${name}"`);
  }
});

test("every declared document type has a registered data model", () => {
  const actorBlock = bootstrap.match(/CONFIG\.Actor\.dataModels = \{([^}]+)\}/u);
  const itemBlock = bootstrap.match(/CONFIG\.Item\.dataModels = \{([^}]+)\}/u);
  assert.ok(actorBlock && itemBlock, "bootstrap must register Actor and Item data models");
  const registered = {
    Actor: new Set(actorBlock[1].split(",").map((part) => part.split(":")[0].trim()).filter(Boolean)),
    Item: new Set(itemBlock[1].split(",").map((part) => part.split(":")[0].trim()).filter(Boolean)),
  };
  for (const [documentName, types] of Object.entries(system.documentTypes)) {
    for (const type of Object.keys(types)) {
      assert.ok(registered[documentName]?.has(type), `${documentName} type "${type}" has no registered data model`);
    }
  }
});

test("every registered data model class is exported by lib/documents.mjs", async () => {
  const documents = await import("../lib/documents.mjs");
  const aliasMatches = [...entry.matchAll(/^\s*(MarvelMultiverse\w+|MarvelDie|dice|models) as (Document\w+|document\w+),?$/gmu)];
  const aliasMap = new Map(aliasMatches.map((m) => [m[2], m[1]]));
  for (const name of extractRegisterCoreConfigNames()) {
    if (!name.startsWith("Document")) continue;
    const exportName = aliasMap.get(name);
    if (!exportName) continue; // Not sourced from lib/documents.mjs (e.g. ChatMessageMarvel).
    assert.equal(typeof documents[exportName], "function", `lib/documents.mjs export "${exportName}" (${name})`);
  }
});

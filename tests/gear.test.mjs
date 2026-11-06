import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GEAR_CATEGORIES, getGearCategoryLabel, normalizeGearCategory } from "../lib/gear.mjs";

test("gear categories cover the expansion equipment foundations", () => {
  assert.deepEqual(Object.keys(GEAR_CATEGORIES), [
    "equipment",
    "iconic-item",
    "battle-suit",
    "narrative-item",
    "gadget",
    "vehicle-mount",
  ]);
  assert.equal(normalizeGearCategory(" BATTLE-SUIT "), "battle-suit");
  assert.equal(normalizeGearCategory("unknown"), "equipment");
  assert.equal(getGearCategoryLabel("iconic-item"), "Iconic Item");
});

test("Foundry registers structured gear without removing legacy items", async () => {
  const template = JSON.parse(await readFile(new URL("../template.json", import.meta.url), "utf8"));
  assert.ok(template.Item.types.includes("item"));
  assert.ok(template.Item.types.includes("gear"));

  const bootstrap = await readFile(new URL("../lib/bootstrap.mjs", import.meta.url), "utf8");
  assert.match(bootstrap, /gear:\s*DocumentMarvelMultiverseGear/u);
});

test("actor inventory creates structured gear and its sheet exposes foundation fields", async () => {
  const inventory = await readFile(new URL("../templates/actor/parts/actor-items.hbs", import.meta.url), "utf8");
  const sheet = await readFile(new URL("../templates/item/item-gear-sheet.hbs", import.meta.url), "utf8");

  assert.match(inventory, /data-type="gear"/u);
  for (const field of [
    "system.category",
    "system.equipped",
    "system.reliance",
    "system.requirements",
    "system.grants.powers",
    "system.protection.healthDamageReduction",
    "system.durability.max",
    "system.mount.requiresOperator",
  ]) {
    assert.match(sheet, new RegExp(field.replaceAll(".", "\\."), "u"), field);
  }
});

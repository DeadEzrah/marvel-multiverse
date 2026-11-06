import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addHeadquartersEntry,
  adjustHeadquartersResources,
  clampHeadquartersResources,
  getHeadquartersActorUuids,
  linkHeadquartersActor,
  normalizeHeadquartersOwnerType,
  normalizeHeadquartersScale,
  removeHeadquartersEntry,
  unlinkHeadquartersActor,
} from "../lib/headquarters.mjs";

function mockHeadquarters() {
  return {
    type: "headquarters",
    isOwner: true,
    system: {
      resources: { value: 2, max: 3 },
      facilities: [],
      upgrades: [],
      actorUuids: [],
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const key = path.replace("system.", "");
        const parts = key.split(".");
        let target = this.system;
        while (parts.length > 1) target = target[parts.shift()];
        target[parts[0]] = value;
      }
    },
  };
}

test("headquarters metadata normalizes generic ownership, scale, resources, and actors", () => {
  assert.equal(normalizeHeadquartersScale(" COMPLEX "), "complex");
  assert.equal(normalizeHeadquartersScale("unknown"), "site");
  assert.equal(normalizeHeadquartersOwnerType("ORGANIZATION"), "organization");
  assert.equal(normalizeHeadquartersOwnerType("unknown"), "team");
  assert.deepEqual(clampHeadquartersResources({ value: 8, max: 5 }), { value: 5, max: 5 });
  assert.deepEqual(clampHeadquartersResources({ value: -2, max: -1 }), { value: 0, max: 0 });
  assert.deepEqual(getHeadquartersActorUuids({ actorUuids: ["Actor.a", "Actor.a", "", null] }), ["Actor.a"]);
});

test("headquarters workflow manages resources, facilities, upgrades, and actor links", async () => {
  const headquarters = mockHeadquarters();
  assert.equal(await adjustHeadquartersResources(headquarters, 5), 3);
  assert.equal(await adjustHeadquartersResources(headquarters, -2), 1);

  await addHeadquartersEntry(headquarters, "facilities", { name: "  Workshop  " });
  await addHeadquartersEntry(headquarters, "upgrades", { name: "Sensors", active: false });
  assert.deepEqual(headquarters.system.facilities, [{ name: "Workshop", description: "", active: true }]);
  assert.equal(headquarters.system.upgrades[0].active, false);
  await removeHeadquartersEntry(headquarters, "facilities", 0);
  assert.deepEqual(headquarters.system.facilities, []);

  await linkHeadquartersActor(headquarters, "Actor.hero");
  await linkHeadquartersActor(headquarters, "Actor.hero");
  assert.deepEqual(headquarters.system.actorUuids, ["Actor.hero"]);
  await unlinkHeadquartersActor(headquarters, "Actor.hero");
  assert.deepEqual(headquarters.system.actorUuids, []);
});

test("Foundry registers a first-class Headquarters model and complete sheet", async () => {
  const system = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));
  const bootstrap = await readFile(new URL("../lib/bootstrap.mjs", import.meta.url), "utf8");
  const documents = await readFile(new URL("../lib/documents.mjs", import.meta.url), "utf8");
  const sheet = await readFile(new URL("../templates/item/item-headquarters-sheet.hbs", import.meta.url), "utf8");

  assert.ok(Object.keys(system.documentTypes.Item).includes("headquarters"));
  assert.match(bootstrap, /headquarters:\s*DocumentMarvelMultiverseHeadquarters/u);
  assert.match(documents, /class MarvelMultiverseHeadquarters extends MarvelMultiverseItemBase/u);
  for (const field of [
    "system.ownership.type",
    "system.ownership.teamName",
    "system.sceneUuid",
    "system.scale",
    "system.location",
    "system.resources.value",
    "system.resources.max",
    "system.defenses.physical",
    "system.facilities",
    "system.upgrades",
    "system.actorUuids",
  ]) {
    assert.match(sheet, new RegExp(field.replaceAll(".", "\\."), "u"), field);
  }
});

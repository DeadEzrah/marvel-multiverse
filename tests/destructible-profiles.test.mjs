import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const root = new URL("../packs/_source/destructibles/", import.meta.url);
const categories = ["Walls and Doors", "Street Objects", "Vehicles", "Large Structures"];
const actors = [];

for (const category of categories) {
  const directory = new URL(`${category}/`, root);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
  for (const file of files) {
    actors.push(JSON.parse(await readFile(new URL(file, directory), "utf8")));
  }
}

test("destructible object pack contains twelve NPC-backed profiles", () => {
  assert.equal(actors.length, 12);
  assert.deepEqual(
    new Set(actors.map((actor) => actor.flags["marvel-multiverse"].destructible.category)),
    new Set(["walls-doors", "street-objects", "vehicles", "large-structures"]),
  );
});

test("destructible profiles are targetable, damage-ready, neutral tokens", () => {
  for (const actor of actors) {
    assert.equal(actor._id.length, 16, `${actor.name}: Foundry document ID length`);
    assert.equal(actor.type, "npc", `${actor.name}: actor type`);
    assert.equal(actor.system.health.value, actor.system.health.max, `${actor.name}: full Health`);
    assert.ok(actor.system.health.max > 0, `${actor.name}: positive Health`);
    assert.ok(actor.system.healthDamageReduction >= 0, `${actor.name}: Damage Reduction`);
    assert.deepEqual(actor.system.focus, { value: 0, max: 0 }, `${actor.name}: no Focus pool`);
    assert.equal(actor.system.abilities.agl.value, -3, `${actor.name}: stationary defense baseline`);
    assert.equal(actor.prototypeToken.actorLink, false, `${actor.name}: unlinked token`);
    assert.equal(actor.prototypeToken.disposition, 0, `${actor.name}: neutral disposition`);
    assert.equal(actor.prototypeToken.bar1.attribute, "health", `${actor.name}: Health bar`);
    assert.equal(actor.prototypeToken.bar2.attribute, null, `${actor.name}: no Focus bar`);
    assert.match(actor.prototypeToken.texture.src, /^systems\/marvel-multiverse\/icons\/destructibles\/.+\.svg$/u);
    assert.equal(actor.flags["marvel-multiverse"].destructible.version, 1);
  }
});

test("every destructible profile has unique system-owned SVG artwork", async () => {
  const artwork = actors.map((actor) => actor.prototypeToken.texture.src);
  assert.equal(new Set(artwork).size, actors.length);

  for (const actor of actors) {
    assert.equal(actor.img, actor.prototypeToken.texture.src, `${actor.name}: portrait and token artwork`);
    const relativePath = actor.img.replace("systems/marvel-multiverse/", "");
    const svg = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, `${actor.name}: valid SVG`);
  }
});

test("system manifest exposes the Actor compendium", async () => {
  const manifest = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));
  const pack = manifest.packs.find((entry) => entry.name === "destructibles");
  assert.deepEqual(
    {
      label: pack?.label,
      path: pack?.path,
      type: pack?.type,
      private: pack?.private,
    },
    {
      label: "Destructible Objects",
      path: "packs/destructibles",
      type: "Actor",
      private: false,
    },
  );
  assert.ok(manifest.packFolders[0].packs.includes("destructibles"));
});

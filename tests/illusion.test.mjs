import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");

const directory = new URL("../packs/_source/powers/Illusion/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Illusion contains the complete 14-power family", () => {
  assert.equal(files.length, 14);
});

test("Dazzle, Deafen, and Flare preserve exact damage and conditions", () => {
  for (const file of ["dazzle.json", "deafen.json"]) {
    const power = powers[file];
    assert.equal(power.system.ability, "ego");
    assert.equal(power.system.targeting.defense, "vig");
    assert.equal(power.system.targeting.range, 20);
    assert.equal(power.system.damage.requiresFantastic, true);
    assert.equal(power.system.damage.doubleOnFantastic, false);
    assert.equal(power.system.events[0].outcomes[0].duration.value, 1);
  }

  const flare = powers["flare.json"];
  assert.equal(flare.system.targeting.area.distance, 5);
  assert.equal(flare.system.damage.scale, 1);
  assert.equal(flare.system.damage.requiresFantastic, true);
  assert.equal(flare.system.damage.doubleOnFantastic, false);
  assert.equal(flare.system.events[0].outcomes[0].statusId, "blinded");
});

test("invisibility powers own exact targets and concentration status", () => {
  const self = powers["invisiblity.json"];
  assert.equal(self.system.activation.target, "none");
  assert.equal(self.system.activation.concentrationStatus, "invisible");
  assert.equal(self.system.activation.concentrationStatusIncludesSource, true);

  const extended = powers["extend-invisibility.json"];
  assert.equal(extended.name, "Extend Invisibility");
  assert.equal(extended.system.activation.maxTargets, 1);
  assert.equal(extended.system.activation.range, 10);

  const group = powers["group-invisiblity.json"];
  const actor = {
    system: {
      attributes: { rank: { value: 4 } },
      abilities: { ego: { defense: 14 } },
    },
  };
  assert.equal(resolveUtilityTargetLimits(group, actor).maximum, 14);
  assert.equal(group.system.targeting.includeSelf, true);
});

test("illusion tiers preserve sensory, size, range, and movement progression", () => {
  const staticIllusion = powers["static-illusion.json"].system.illusion;
  const animated = powers["animated-illusion.json"].system.illusion;
  const grand = powers["grand-illusion.json"].system.illusion;

  assert.deepEqual(
    [staticIllusion.maximumSizeSteps, animated.maximumSizeSteps, grand.maximumSizeSteps],
    [3, 4, 5],
  );
  assert.deepEqual([staticIllusion.mobile, animated.mobile, grand.mobile], [false, true, true]);
  assert.deepEqual(staticIllusion.senses, ["visual"]);
  assert.deepEqual(animated.senses, ["visual"]);
  assert.deepEqual(grand.senses, ["visual", "auditory"]);
  assert.equal(grand.range, 50);
});

test("area and illumination powers preserve exact concentration boundaries", () => {
  const illumination = powers["illumination.json"];
  assert.equal(illumination.system.illusion.range, 50);
  assert.equal(illumination.system.illusion.maintainsOutsideRange, true);

  for (const file of ["darkness.json", "silence-area.json"]) {
    const power = powers[file];
    assert.equal(power.system.illusion.placementRange, 50);
    assert.equal(power.system.illusion.widthPerRank, 5);
    assert.equal(power.system.illusion.maintenanceRange, 50);
    assert.equal(power.system.events[0].outcomes[0].duration.type, "concentration");
  }
});

test("Mirror Images and Silence Self preserve safe manual boundaries", () => {
  const mirror = powers["mirror-images.json"];
  assert.equal(mirror.name, "Mirror Images");
  assert.equal(mirror.system.illusion.duplicatesPerRank, 1);
  assert.equal(mirror.system.illusion.initialPlacementRange, 2);
  assert.equal(mirror.system.illusion.maximumDistance, 10);

  const silence = powers["silence-self.json"];
  const modifier = silence.system.events[0].outcomes[0].effect.flags["marvel-multiverse"].actionRollModifier;
  assert.equal(modifier.mode, "edge");
  assert.equal(modifier.ability, "agl");
  assert.equal(modifier.selection, "optional");
  assert.equal(modifier.nonStacking, true);
});

test("all Illusion events and semantic profiles are valid", () => {
  const profiles = new Set([
    "illusion.hologram",
    "illusion.grand",
    "illusion.invisibility",
    "illusion.mirror",
    "illusion.light",
    "illusion.darkness",
    "illusion.silence",
    "illusion.dazzle",
    "illusion.deafen",
    "power.light.flare",
  ]);

  for (const [file, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${file}: ${JSON.stringify(validation.issues)}`);
    assert.equal(Object.keys(power.system.effectProfiles ?? {}).length > 0, true, `${file}: missing profile`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${file}: ${profile}`);
    }
  }
});

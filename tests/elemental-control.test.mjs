import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { resolveActorFocusCost } = await import("../lib/focus-automation.mjs");
const { resolveUtilityFocusAmount } = await import("../lib/services/utility-activation.mjs");
const { resolveElementalProtection, applyElementalProtection } = await import("../lib/services/elemental-protection.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { validateTargetPrerequisites } = await import("../lib/services/target-prerequisites.mjs");

const directory = new URL("../packs/_source/powers/Elemental Control/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Elemental Control contains eighteen structured powers", () => {
  assert.equal(files.length, 18);
  for (const [file, power] of Object.entries(powers)) {
    assert.equal(typeof power.system.elementalControl, "object", `${file}: family metadata`);
    assert.equal(validatePowerEvents(power.system.events).valid, true, `${file}: event schema`);
  }
});

test("elemental blast attacks preserve exact Focus and damage scaling", () => {
  const burst = powers["elemental-burst.json"].system;
  const blast = powers["elemental-blast.json"].system;
  const barrage = powers["elemental-barrage.json"].system;
  const supernova = powers["supernova.json"].system;

  assert.equal(burst.damage.doubleOnFantastic, true);
  assert.equal(blast.attackEdgeMode, "edge");
  assert.deepEqual(blast.focusScaling, {
    enabled: true,
    mode: "damage",
    benefitPerFocus: 1,
    focusPerBenefit: 2,
  });
  assert.equal(blast.damage.includeFocusBonusInBase, true);
  for (const area of [barrage, supernova]) {
    assert.equal(area.damage.scale, 0.5);
    assert.equal(area.damage.fantasticScale, 1);
    assert.equal(area.damage.doubleOnFantastic, false);
    assert.equal(area.targeting.area.targetFilter, "enemies");
  }
  assert.equal(supernova.focusScaling.focusPerBenefit, 2);
});

test("Elemental Protection tiers absorb exact thresholds and tier four is corrected", () => {
  for (let tier = 1; tier <= 4; tier += 1) {
    const power = powers[`elemental-protection-${tier}.json`];
    const marker = power.system.events[0].outcomes[0];
    assert.equal(power.system.numbered, tier);
    assert.equal(power.system.cost, `${tier * 5} Focus`);
    assert.equal(power.system.elementalControl.protectionThreshold, tier * 10);
    assert.equal(marker.effect.flags["marvel-multiverse"].elementalControl.protectionThreshold, tier * 10);
    assert.equal(marker.duration.type, "concentration");
  }
  assert.equal(powers["elemental-protection-4.json"].system.prerequisites, "Elemental Protection 3, Rank 5");
});

test("elemental protection absorbs its threshold and breaks on excess damage", async () => {
  const retained = {
    id: "protection",
    disabled: false,
    flags: { "marvel-multiverse": { elementalControl: { protectionThreshold: 20 } } },
  };
  const actor = {
    effects: [retained],
    deleted: [],
    async deleteEmbeddedDocuments(_type, ids) {
      this.deleted.push(...ids);
    },
  };

  assert.deepEqual(resolveElementalProtection(actor, 15), {
    active: true,
    effect: retained,
    effectId: "protection",
    incomingDamage: 15,
    absorbedDamage: 15,
    remainingDamage: 0,
    threshold: 20,
    destroyed: false,
  });
  const breached = await applyElementalProtection(actor, 27);
  assert.equal(breached.absorbedDamage, 20);
  assert.equal(breached.remainingDamage, 7);
  assert.equal(breached.destroyed, true);
  assert.deepEqual(actor.deleted, ["protection"]);
});

test("sphere and prison Focus choices follow the highest owned protection tier", async () => {
  const actor = {
    system: { focus: { value: 100 } },
    items: [
      { name: "Elemental Protection 1", system: { powerSet: "Elemental Control", numbered: 1 } },
      { name: "Elemental Protection 2", system: { powerSet: "Elemental Control", numbered: 2 } },
      { name: "Elemental Protection 3", system: { powerSet: "Elemental Control", numbered: 3 } },
    ],
  };
  for (const file of ["elemental-sphere.json", "elemental-prison.json"]) {
    const power = powers[file];
    const cost = resolveActorFocusCost(power, actor);
    assert.deepEqual([cost.minimum, cost.maximum, cost.step], [5, 15, 5], file);
    assert.deepEqual(await resolveUtilityFocusAmount(power, actor, 10), { success: true, amount: 10 }, file);
    assert.deepEqual(await resolveUtilityFocusAmount(power, actor, 12), { success: false, reason: "invalid-focus-amount" }, file);
    assert.deepEqual(await resolveUtilityFocusAmount(power, actor, 20), { success: false, reason: "invalid-focus-amount" }, file);
  }
});

test("hydrated empty tier configuration does not cap ordinary variable Focus powers", () => {
  const blast = structuredClone(powers["elemental-blast.json"]);
  blast.system.activation = { focusStep: 0, focusMaximumFromPowerTier: {} };
  const cost = resolveActorFocusCost(blast, { items: [] });
  assert.equal(cost.minimum, 5);
  assert.equal(cost.maximum, null);
});

test("grab, push, suffocation, and ricochet preserve their special boundaries", () => {
  const grab = powers["elemental-grab.json"].system;
  const push = powers["elemental-push.json"].system;
  const suffocation = powers["elemental-suffocation.json"].system;
  const ricochet = powers["elemental-richochet.json"];

  assert.equal(grab.targeting.range, 5);
  assert.equal(grab.targeting.rangeScaling, "rank");
  assert.equal(grab.elementalControl.escapeTargetNumber, 20);
  assert.equal(grab.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(push.elementalControl.movementSpacesPerRank, 1);
  assert.equal(push.damage.requiresFantastic, true);
  assert.equal(push.events[1].outcomes[0].statusId, "prone");
  assert.equal(validateTargetPrerequisites(suffocation.targeting.prerequisites).valid, true);
  assert.equal(suffocation.targeting.prerequisites[0].value, "grappled");
  assert.equal(ricochet.name, "Elemental Ricochet");
  assert.equal(ricochet.system.damage.doubleOnFantastic, false);
  assert.equal(ricochet.system.elementalControl.repeatWhileFantastic, true);
});

test("sphere, prison, infusion, reinforcement, and form expose safe automation boundaries", () => {
  const sphere = powers["elemental-sphere.json"].system;
  const prison = powers["elemental-prison.json"].system;
  const infusion = powers["elemental-infusion.json"].system;
  const reinforcement = powers["elemental-reinforcement.json"].system;
  const form = powers["elemental-form.json"].system;

  assert.equal(sphere.activation.target, "optional");
  assert.equal(sphere.events[0].recipient, "self-and-target");
  assert.equal(sphere.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(prison.targeting.area.distance, 5);
  assert.equal(prison.targeting.area.distanceScaling, "rank");
  assert.equal(prison.targeting.area.persistent, true);
  assert.equal(prison.damage.requiresFantastic, true);
  assert.equal(infusion.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(reinforcement.activation.reactionType, "incoming-health-damage");
  assert.equal(reinforcement.events[0].outcomes[1].resource, "focus");
  assert.equal(reinforcement.events[0].outcomes[1].amountMultiplier, -1);
  assert.equal(form.elementalControl.reformAtPositiveHealth, true);
  assert.equal(form.elementalControl.zeroHealthStateManual, true);
});

test("Elemental semantic aliases resolve to registered effects", async () => {
  const manifest = JSON.parse(await readFile(new URL("../assets/effects-manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.fallbacks["elemental.attack"], "power.energy.blast");
  assert.equal(manifest.fallbacks["elemental.impact"], "power.energy.impact");
  assert.equal(manifest.fallbacks["elemental.wall"], "defense.elemental.wall");
  assert.equal(manifest.fallbacks["elemental.guard"], "shield-bearer.guard");
  assert.equal(manifest.fallbacks["elemental.grab"], "telekinesis.grab");
});

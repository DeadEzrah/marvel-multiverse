import test from "node:test";
import assert from "node:assert/strict";

const {
  automationPresetIds,
  getAutomationPreset,
  materializeAutomationSource,
  resolveAutomationSystem,
} = await import("../lib/services/automation-presets.mjs");
const { buildActionRollRequest } = await import("../lib/services/action-roll.mjs");

const actor = { system: { abilities: { ego: { value: 3 }, mle: { value: 2 } } }, items: [], effects: [] };

test("automation presets expose stable identifiers", () => {
  assert.deepEqual([...automationPresetIds].sort(), [
    "attack.ranged.single-blast",
    "attack.single-focus",
    "check.opposed.single",
  ]);
  assert.equal(getAutomationPreset(" attack.single-focus "), getAutomationPreset("attack.single-focus"));
  assert.equal(getAutomationPreset("missing.preset"), null);
  assert.equal(getAutomationPreset(""), null);
});

test("resolveAutomationSystem merges preset defaults into the item system", () => {
  const merged = resolveAutomationSystem({ automationPreset: "attack.ranged.single-blast", ability: "ego" });

  assert.equal(merged.attack, true);
  assert.equal(merged.attackKind, "ranged");
  assert.equal(merged.ability, "ego");
  assert.deepEqual(merged.targeting, { required: true, count: 1, requiresLineOfSight: true });
  assert.deepEqual(merged.damage, { enabled: true, type: "health", doubleOnFantastic: true });
  assert.equal(merged.effectProfiles.attack, "power.energy.blast");
  assert.equal(merged.effectProfiles.hit, "power.energy.impact");
});

test("explicit item fields take precedence over preset defaults", () => {
  const merged = resolveAutomationSystem({
    automationPreset: "attack.ranged.single-blast",
    damage: { enabled: false },
    targeting: { count: 3 },
    effectProfiles: { attack: "custom.blast" },
  });

  assert.equal(merged.damage.enabled, false);
  // Deep merging keeps preset keys the item did not explicitly override.
  assert.equal(merged.damage.doubleOnFantastic, true);
  assert.equal(merged.targeting.count, 3);
  assert.equal(merged.targeting.required, true);
  assert.equal(merged.targeting.requiresLineOfSight, true);
  assert.equal(merged.effectProfiles.attack, "custom.blast");
  assert.equal(merged.effectProfiles.hit, "power.energy.impact");
});

test("unknown presets leave the system untouched", () => {
  const system = { automationPreset: "missing.preset", damage: { enabled: true } };
  assert.equal(resolveAutomationSystem(system, { warn: false }), system);
});

test("materializeAutomationSource preserves source identity while swapping the system", () => {
  const source = {
    name: "Shut Down Powers",
    type: "power",
    system: { automationPreset: "check.opposed.single", ability: "ego" },
  };
  const materialized = materializeAutomationSource(source);

  assert.notEqual(materialized, source);
  assert.equal(materialized.name, "Shut Down Powers");
  assert.equal(materialized.type, "power");
  assert.equal(materialized.system.attack, true);
  assert.equal(materialized.system.damage.enabled, false);
  assert.equal(materialized.system.ability, "ego");
  // The original source stays untouched.
  assert.equal(source.system.attack, undefined);

  const plain = { name: "No Preset", system: { ability: "mle" } };
  assert.equal(materializeAutomationSource(plain), plain);
});

test("damage.enabled: false overrides preset damage when building a roll request", () => {
  const source = materializeAutomationSource({
    name: "Dampen Power",
    system: {
      automationPreset: "attack.ranged.single-blast",
      ability: "ego",
      damage: { enabled: false },
    },
  });
  const request = buildActionRollRequest({ actor, source });

  assert.equal(request.isAttack, true);
  assert.equal(request.dealsDamage, false);
});

test("damage.enabled: false overrides legacy attack and damage-type hints", () => {
  const request = buildActionRollRequest({
    actor,
    source: {
      name: "Suppressing Gaze",
      system: {
        attack: true,
        attackKind: "ranged",
        damageType: "health",
        damage: { enabled: false },
      },
    },
  });

  assert.equal(request.isAttack, true);
  assert.equal(request.dealsDamage, false);
});

test("attacks without an explicit damage flag keep dealing damage by default", () => {
  const request = buildActionRollRequest({
    actor,
    source: { name: "Smash", system: { attack: true, damageType: "health" } },
  });

  assert.equal(request.isAttack, true);
  assert.equal(request.dealsDamage, true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  buildActionRollRequest,
  findTargetRangeViolation,
  resolveTargetingConfig
} = await import("../lib/services/action-roll.mjs");
const {
  resolveDamage,
  resolveDamageConfig
} = await import("../lib/services/damage-resolver.mjs");
const { parseFocusCost } = await import("../lib/focus-automation.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Ranged%20Weapons/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const headshot = await loadPower("headshot.json");
const sniping = await loadPower("sniping.json");

const attacker = {
  system: {
    abilities: {
      agl: {
        value: 4,
        damageMultiplier: 2
      }
    }
  }
};
const target = {
  system: {
    healthDamageReduction: 0
  }
};

function resolutionFor(source, isFantastic) {
  return resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "agl" },
    rollResult: { isSuccess: true, isFantastic, marvelDie: 3 },
    config: resolveDamageConfig(source)
  });
}

test("Headshot deals double ordinary damage and triple Fantastic damage with Trouble", () => {
  const request = buildActionRollRequest({
    actor: attacker,
    source: headshot,
    targets: []
  });

  assert.equal(resolutionFor(headshot, false).finalDamage, 20);
  assert.equal(resolutionFor(headshot, true).finalDamage, 30);
  assert.equal(resolutionFor(headshot, true).fantasticMultiplier, 1.5);
  assert.equal(request.trouble, 1);
  assert.equal(parseFocusCost(headshot.system.cost).value, 15);
  assert.equal(headshot.system.effectProfiles.attack, "weapon.projectile.gunshot");
});

test("Sniping deals regular or triple damage and requires an enemy at least 20 spaces away", () => {
  const targeting = resolveTargetingConfig(sniping);

  assert.equal(resolutionFor(sniping, false).finalDamage, 10);
  assert.equal(resolutionFor(sniping, true).finalDamage, 30);
  assert.equal(resolutionFor(sniping, true).fantasticMultiplier, 3);
  assert.equal(targeting.minimumRange, 20);
  assert.equal(targeting.targetFilter, "enemies");
  assert.equal(parseFocusCost(sniping.system.cost).value, 5);
  assert.equal(sniping.system.effectProfiles.attack, "weapon.projectile.gunshot");
});

test("minimum range accepts exactly 20 spaces and rejects a closer target", () => {
  const token = (x) => ({ x, y: 0, width: 1, height: 1 });
  const canvas = {
    grid: { size: 100 },
    scene: { grid: { distance: 1 } }
  };
  const request = {
    token: token(0),
    targeting: { minimumRange: 20 },
    allTargets: [token(2000)]
  };

  assert.equal(findTargetRangeViolation(request, canvas), null);
  request.allTargets = [token(1900)];
  const violation = findTargetRangeViolation(request, canvas);
  assert.equal(violation.type, "minimum");
  assert.equal(violation.minimum, 20);
  assert.equal(violation.distance, 19);
});

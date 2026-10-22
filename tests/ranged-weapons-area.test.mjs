import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  resolveAreaTargetingConfig,
  resolveSourceCircleTargets
} = await import("../lib/services/area-targeting.mjs");
const {
  resolveDamage,
  resolveDamageConfig
} = await import("../lib/services/damage-resolver.mjs");
const { parseFocusCost } = await import("../lib/focus-automation.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Ranged%20Weapons/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const danceOfDeath = await loadPower("dance-of-death.json");
const orchestraOfOverkill = await loadPower("orchestra-of-overkill.json");

test("Ranged Weapons area attacks use their exact source-centered enemy radii", () => {
  const danceArea = resolveAreaTargetingConfig(danceOfDeath);
  const orchestraArea = resolveAreaTargetingConfig(orchestraOfOverkill);

  assert.deepEqual(
    {
      shape: danceArea.shape,
      origin: danceArea.origin,
      distance: danceArea.distance,
      targetFilter: danceArea.targetFilter,
      requiresLineOfSight: danceArea.requiresLineOfSight,
      attackAnimation: danceArea.attackAnimation
    },
    {
      shape: "circle",
      origin: "source",
      distance: 5,
      targetFilter: "enemies",
      requiresLineOfSight: true,
      attackAnimation: "targets"
    }
  );
  assert.equal(orchestraArea.distance, 10);
  assert.equal(orchestraArea.targetFilter, "enemies");
  assert.equal(orchestraArea.requiresLineOfSight, true);
  assert.equal(orchestraArea.attackAnimation, "targets");
});

test("source circles include only visible enemies in range and line of sight", () => {
  const token = (uuid, x, disposition, options = {}) => ({
    actor: {},
    visible: options.visible !== false,
    document: { uuid, x, y: 0, width: 1, height: 1, disposition }
  });
  const source = token("Token.source", 0, 1);
  const eligibleEnemy = token("Token.eligible", 400, -1);
  const blockedEnemy = token("Token.blocked", 300, -1);
  const distantEnemy = token("Token.distant", 600, -1);
  const ally = token("Token.ally", 200, 1);
  const hiddenEnemy = token("Token.hidden", 200, -1, { visible: false });

  const targets = resolveSourceCircleTargets(
    source,
    [source, eligibleEnemy, blockedEnemy, distantEnemy, ally, hiddenEnemy],
    resolveAreaTargetingConfig(danceOfDeath),
    {
      gridSize: 100,
      sceneCellDistance: 1,
      testLineOfSight: (_from, to) => to.x !== 350
    }
  );

  assert.deepEqual(targets.map((entry) => entry.document.uuid), ["Token.eligible"]);
});

test("Dance of Death and Orchestra of Overkill deal half or full damage", () => {
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
  const damage = (source, isFantastic) => resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "agl" },
    rollResult: { isSuccess: true, isFantastic, marvelDie: 3 },
    config: resolveDamageConfig(source)
  }).finalDamage;

  assert.equal(damage(danceOfDeath, false), 5);
  assert.equal(damage(danceOfDeath, true), 10);
  assert.equal(damage(orchestraOfOverkill, false), 5);
  assert.equal(damage(orchestraOfOverkill, true), 10);
  assert.equal(parseFocusCost(danceOfDeath.system.cost).value, 10);
  assert.equal(parseFocusCost(orchestraOfOverkill.system.cost).value, 15);
  assert.equal(danceOfDeath.system.effectProfiles.attack, "weapon.projectile.gunshot");
  assert.equal(orchestraOfOverkill.system.effectProfiles.attack, "weapon.projectile.gunshot");
});

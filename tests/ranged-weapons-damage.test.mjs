import test from "node:test";
import assert from "node:assert/strict";

const {
  resolveDamage,
  resolveDamageConfig
} = await import("../lib/services/damage-resolver.mjs");

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

function damageFor(source, isFantastic) {
  return resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "agl" },
    rollResult: { isSuccess: true, isFantastic, marvelDie: 3 },
    config: resolveDamageConfig(source)
  }).finalDamage;
}

test("Double Tap, Point-Blank Parry, and Stopping Power deal regular or double damage", () => {
  const source = {
    system: {
      ability: "agl",
      damage: {
        enabled: true,
        type: "health",
        doubleOnFantastic: true
      }
    }
  };

  assert.equal(damageFor(source, false), 10);
  assert.equal(damageFor(source, true), 20);
});

test("Snap Shooting and Weapons Blazing deal half regular damage or full Fantastic damage", () => {
  const source = {
    system: {
      ability: "agl",
      damage: {
        enabled: true,
        type: "health",
        scale: 0.5,
        doubleOnFantastic: true
      }
    }
  };

  assert.equal(damageFor(source, false), 5);
  assert.equal(damageFor(source, true), 10);
});

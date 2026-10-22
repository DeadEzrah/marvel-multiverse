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
    healthDamageReduction: 0,
    focusDamageReduction: 0
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

test("Double Tap, Point-Blank Parry, Stopping Power, and Kill Zone deal regular or double damage", () => {
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

test("Suppressive, Return, and Covering Fire damage Focus after Health Damage Reduction", () => {
  const source = {
    system: {
      ability: "agl",
      damage: {
        enabled: true,
        type: "focus",
        damageReductionType: "health",
        doubleOnFantastic: true
      }
    }
  };
  const reducedTarget = {
    system: {
      healthDamageReduction: 1,
      focusDamageReduction: 0
    }
  };
  const damage = (isFantastic) => resolveDamage({
    attacker,
    target: reducedTarget,
    source,
    rollContext: { ability: "agl" },
    rollResult: { isSuccess: true, isFantastic, marvelDie: 3 },
    config: resolveDamageConfig(source)
  });

  assert.equal(damage(false).damageType, "focus");
  assert.equal(damage(false).damageReductionType, "health");
  assert.equal(damage(false).damageReduction, 1);
  assert.equal(damage(false).finalDamage, 7);
  assert.equal(damage(true).finalDamage, 14);
});

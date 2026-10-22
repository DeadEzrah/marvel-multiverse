import test from "node:test";
import assert from "node:assert/strict";

const {
  resolveDamage,
  resolveDamageConfig
} = await import("../lib/services/damage-resolver.mjs");

test("Deafen deals regular damage only on a Fantastic success", () => {
  const attacker = {
    system: {
      abilities: {
        ego: {
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
  const source = {
    system: {
      ability: "ego",
      damage: {
        enabled: true,
        type: "health",
        requiresFantastic: true,
        doubleOnFantastic: false
      }
    }
  };
  const config = resolveDamageConfig(source);
  const regular = resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "ego" },
    rollResult: { isSuccess: true, isFantastic: false, marvelDie: 3 },
    config
  });
  const fantastic = resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "ego" },
    rollResult: { isSuccess: true, isFantastic: true, marvelDie: 3 },
    config
  });

  assert.equal(regular.finalDamage, 0);
  assert.equal(regular.reason, "fantastic-required");
  assert.equal(fantastic.finalDamage, 10);
  assert.equal(fantastic.fantasticBonus, 0);
});

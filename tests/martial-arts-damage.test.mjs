import test from "node:test";
import assert from "node:assert/strict";

const {
  canApplyMultiTargetDamage,
  resolveActorDamageModifier,
  resolveDamage,
  resolveDamageConfig
} = await import("../lib/services/damage-resolver.mjs");

const attacker = {
  system: {
    abilities: {
      mle: {
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

test("Fast Strikes scales regular damage to half and Fantastic damage to full", () => {
  const source = {
    system: {
      ability: "mle",
      damage: {
        enabled: true,
        type: "health",
        scale: 0.5,
        doubleOnFantastic: true
      }
    }
  };
  const config = resolveDamageConfig(source);

  const normal = resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "mle" },
    rollResult: { isSuccess: true, isFantastic: false, marvelDie: 3 },
    config
  });
  const fantastic = resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "mle" },
    rollResult: { isSuccess: true, isFantastic: true, marvelDie: 3 },
    config
  });

  assert.equal(normal.finalDamage, 5);
  assert.equal(fantastic.finalDamage, 10);
});

test("Focused Strike includes its minimum Focus bonus and scales extra Focus", () => {
  const source = {
    system: {
      ability: "mle",
      cost: "10 or more Focus",
      focusScaling: {
        enabled: true,
        mode: "damage",
        benefitPerFocus: 1,
        focusPerBenefit: 2
      },
      damage: {
        enabled: true,
        type: "health",
        modifier: 5,
        includeFocusBonusInBase: true,
        doubleOnFantastic: true
      }
    }
  };
  const config = resolveDamageConfig(source);

  const minimumSpend = resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "mle", focusAmount: 10 },
    rollResult: { isSuccess: true, isFantastic: false, marvelDie: 3 },
    config
  });
  const extraSpend = resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "mle", focusAmount: 14 },
    rollResult: { isSuccess: true, isFantastic: true, marvelDie: 3 },
    config
  });

  assert.equal(minimumSpend.finalDamage, 15);
  assert.equal(extraSpend.focusBonus, 2);
  assert.equal(extraSpend.finalDamage, 34);
});

test("Banging Heads damage requires every target to succeed", () => {
  const config = { requireAllTargetsHit: true };
  const firstTarget = { isSuccess: true };

  assert.equal(
    canApplyMultiTargetDamage(config, firstTarget, [firstTarget, { isSuccess: true }]),
    true
  );
  assert.equal(
    canApplyMultiTargetDamage(config, firstTarget, [firstTarget, { isSuccess: false }]),
    false
  );
});

test("Attack Stance doubles the Melee ability bonus while its effect is active", () => {
  const stanceAttacker = {
    ...attacker,
    effects: [{
      disabled: false,
      flags: {
        "marvel-multiverse": {
          damageModifier: {
            ability: "mle",
            abilityValueMultiplier: 1
          }
        }
      }
    }]
  };
  const source = {
    system: {
      ability: "mle",
      damage: {
        enabled: true,
        type: "health",
        multiplier: 2
      }
    }
  };

  assert.equal(resolveActorDamageModifier(stanceAttacker, "mle", 4), 4);
  assert.equal(resolveActorDamageModifier(stanceAttacker, "agl", 4), 0);

  const result = resolveDamage({
    attacker: stanceAttacker,
    target,
    source,
    rollContext: { ability: "mle" },
    rollResult: { isSuccess: true, isFantastic: false, marvelDie: 3 },
    config: resolveDamageConfig(source)
  });

  assert.equal(result.actorDamageModifier, 4);
  assert.equal(result.finalDamage, 14);
});

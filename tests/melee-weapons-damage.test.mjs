import test from "node:test";
import assert from "node:assert/strict";

const {
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

test("Vicious Attack deals regular damage and doubles Fantastic damage", () => {
  const source = {
    system: {
      ability: "mle",
      damage: {
        enabled: true,
        type: "health",
        doubleOnFantastic: true
      }
    }
  };
  const config = resolveDamageConfig(source);

  const regular = resolveDamage({
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

  assert.equal(regular.finalDamage, 10);
  assert.equal(fantastic.finalDamage, 20);
});

test("Fast Attacks deals half regular damage and full Fantastic damage", () => {
  const highMultiplierAttacker = {
    system: {
      abilities: {
        mle: {
          value: 4,
          damageMultiplier: 4
        }
      }
    }
  };
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

  const regular = resolveDamage({
    attacker: highMultiplierAttacker,
    target,
    source,
    rollContext: { ability: "mle" },
    rollResult: { isSuccess: true, isFantastic: false, marvelDie: 3 },
    config
  });
  const fantastic = resolveDamage({
    attacker: highMultiplierAttacker,
    target,
    source,
    rollContext: { ability: "mle" },
    rollResult: { isSuccess: true, isFantastic: true, marvelDie: 3 },
    config
  });

  assert.equal(regular.finalDamage, 8);
  assert.equal(fantastic.finalDamage, 16);
});

test("Whirling Frenzy deals half regular damage and full Fantastic damage", () => {
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

  const regular = resolveDamage({
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

  assert.equal(regular.finalDamage, 5);
  assert.equal(fantastic.finalDamage, 10);
});

test("Furious Attacks includes Focus scaling before half or full damage", () => {
  const source = {
    system: {
      ability: "mle",
      cost: "10 or more Focus",
      damage: {
        enabled: true,
        type: "health",
        modifier: 5,
        includeFocusBonusInBase: true,
        scale: 0.5,
        doubleOnFantastic: true
      },
      focusScaling: {
        enabled: true,
        mode: "damage",
        benefitPerFocus: 1,
        focusPerBenefit: 2
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

  assert.equal(minimumSpend.finalDamage, 8);
  assert.equal(extraSpend.focusBonus, 2);
  assert.equal(extraSpend.finalDamage, 17);
});

test("Focused Fury applies its minimum and extra Focus before Fantastic doubling", () => {
  const source = {
    system: {
      ability: "mle",
      cost: "5 or more Focus",
      damage: {
        enabled: true,
        type: "health",
        modifier: 2,
        includeFocusBonusInBase: true,
        doubleOnFantastic: true
      },
      focusScaling: {
        enabled: true,
        mode: "damage",
        benefitPerFocus: 1,
        focusPerBenefit: 2
      }
    }
  };
  const config = resolveDamageConfig(source);

  const minimumSpend = resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "mle", focusAmount: 5 },
    rollResult: { isSuccess: true, isFantastic: false, marvelDie: 3 },
    config
  });
  const extraSpend = resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: "mle", focusAmount: 9 },
    rollResult: { isSuccess: true, isFantastic: true, marvelDie: 3 },
    config
  });

  assert.equal(minimumSpend.finalDamage, 12);
  assert.equal(extraSpend.focusBonus, 2);
  assert.equal(extraSpend.finalDamage, 28);
});

test("Exploit ignores Health Damage Reduction", () => {
  const armoredTarget = {
    system: {
      healthDamageReduction: 8
    }
  };
  const source = {
    system: {
      ability: "mle",
      damage: {
        enabled: true,
        type: "health",
        ignoreDamageReduction: true,
        doubleOnFantastic: true
      }
    }
  };

  const result = resolveDamage({
    attacker,
    target: armoredTarget,
    source,
    rollContext: { ability: "mle" },
    rollResult: { isSuccess: true, isFantastic: false, marvelDie: 3 },
    config: resolveDamageConfig(source)
  });

  assert.equal(result.damageReduction, 0);
  assert.equal(result.finalDamage, 10);
});

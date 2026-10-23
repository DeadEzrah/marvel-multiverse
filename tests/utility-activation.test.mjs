import test from "node:test";
import assert from "node:assert/strict";

const {
  resolveConcentrationStatusActorUuids,
  resolveLatestDamageReactionContext,
  resolveUtilityFocusAmount
} = await import("../lib/services/utility-activation.mjs");
const { resolveReactionAllowance, resolveReactionTarget } = await import("../lib/services/reaction-context.mjs");

test("actor-only reaction targets are wrapped for action targeting", () => {
  const previousFromUuidSync = globalThis.fromUuidSync;
  const actor = { uuid: "Actor.attacker", name: "Attacker", documentName: "Actor" };
  globalThis.fromUuidSync = () => actor;
  try {
    const target = resolveReactionTarget({ targetActorUuid: actor.uuid });
    assert.equal(target.actor, actor);
    assert.equal(target.raw.actor, actor);
  } finally {
    globalThis.fromUuidSync = previousFromUuidSync;
  }
});

test("utility concentration statuses resolve direct Actor targets", () => {
  const source = { uuid: "Actor.source", documentName: "Actor" };
  const target = { uuid: "Actor.target", documentName: "Actor" };
  const wrapped = { actor: { uuid: "Actor.wrapped" } };

  assert.deepEqual(
    resolveConcentrationStatusActorUuids(source, [target, wrapped], true),
    ["Actor.source", "Actor.target", "Actor.wrapped"],
  );
});

test("variable utility Focus accepts a selected amount within actor limits", async () => {
  const source = {
    name: "Do This All Day",
    system: {
      cost: "5 or more Focus"
    }
  };
  const actor = {
    system: {
      focus: {
        value: 12
      }
    }
  };

  assert.deepEqual(
    await resolveUtilityFocusAmount(source, actor, 7),
    { success: true, amount: 7 }
  );
});

test("variable utility Focus rejects values outside the allowed range", async () => {
  const source = {
    name: "Do This All Day",
    system: {
      cost: "5 or more Focus"
    }
  };
  const actor = {
    system: {
      focus: {
        value: 12
      }
    }
  };

  assert.deepEqual(
    await resolveUtilityFocusAmount(source, actor, 4),
    { success: false, reason: "invalid-focus-amount" }
  );
  assert.deepEqual(
    await resolveUtilityFocusAmount(source, actor, 13),
    { success: false, reason: "invalid-focus-amount" }
  );
});

test("Fast Hands grants one additional Ranged Weapons reaction", () => {
  const effect = {
    id: "fast-hands",
    origin: "Item.fast-hands",
    transfer: true,
    flags: {
      "marvel-multiverse": {
        reactionAllowance: {
          count: 1,
          powerSet: "Ranged Weapons"
        }
      }
    }
  };
  const actor = {
    effects: [effect],
    items: [{ effects: [effect] }]
  };

  assert.deepEqual(
    resolveReactionAllowance(actor, "Ranged Weapons"),
    { base: 1, additional: 1, total: 2, powerSet: "Ranged Weapons" }
  );
  assert.deepEqual(
    resolveReactionAllowance(actor, "Martial Arts"),
    { base: 1, additional: 0, total: 1, powerSet: "Martial Arts" }
  );
});

test("Brace for Impact resolves only the latest unused physical Health damage", () => {
  const actor = { uuid: "Actor.defender" };
  const source = {
    system: {
      activation: {
        reactionType: "incoming-physical-damage"
      }
    }
  };
  const createMessage = (id, flags) => ({
    id,
    uuid: `ChatMessage.${id}`,
    getFlag: (_scope, key) => flags[key] ?? null
  });

  const physicalDamage = createMessage("physical", {
    rollContext: { element: null },
    actionDamage: {
      targetUuid: actor.uuid,
      damage: { damageType: "health" },
      apply: { success: true, appliedDamage: 8, previousValue: 30 }
    }
  });
  const elementalDamage = createMessage("elemental", {
    rollContext: { element: "fire" },
    actionDamage: {
      targetUuid: actor.uuid,
      damage: { damageType: "health" },
      apply: { success: true, appliedDamage: 12, previousValue: 30 }
    }
  });

  assert.deepEqual(
    resolveLatestDamageReactionContext(actor, source, [physicalDamage, elementalDamage]),
    {
      type: "incoming-physical-damage",
      sourceDamageMessageUuid: "ChatMessage.physical",
      appliedDamage: 8,
      previousValue: 30,
      targetActorUuid: actor.uuid
    }
  );

  const reactionMessage = createMessage("reaction", {
    reactionContext: { sourceDamageMessageUuid: "ChatMessage.physical" },
    resolution: { eventTransactions: [{ undone: false }] }
  });
  assert.equal(
    resolveLatestDamageReactionContext(actor, source, [physicalDamage, reactionMessage]),
    null
  );
});

test("Return Fire targets the attacker from the latest incoming attack", () => {
  const actor = { uuid: "Actor.defender" };
  const source = {
    system: {
      activation: {
        reactionType: "incoming-attack"
      }
    }
  };
  const attackMessage = {
    id: "incoming-attack",
    uuid: "ChatMessage.incoming-attack",
    getFlag: (_scope, key) => ({
      rollContext: {
        actorUuid: "Actor.attacker",
        tokenUuid: "Scene.scene.Token.attacker",
        targetUuids: [actor.uuid]
      },
      actionRoll: {
        request: { target: { actorUuid: actor.uuid } },
        result: { isSuccess: false }
      }
    })[key] ?? null
  };

  assert.deepEqual(
    resolveLatestDamageReactionContext(actor, source, [attackMessage]),
    {
      type: "incoming-attack",
      sourceDamageMessageUuid: "ChatMessage.incoming-attack",
      targetActorUuid: "Actor.attacker",
      targetUuid: "Scene.scene.Token.attacker"
    }
  );
});

test("Point-Blank Parry targets the attacker from the latest incoming miss", () => {
  const actor = { uuid: "Actor.defender" };
  const source = {
    system: {
      activation: {
        reactionType: "incoming-attack-miss"
      }
    }
  };
  const createAttackMessage = (id, isSuccess) => ({
    id,
    uuid: `ChatMessage.${id}`,
    getFlag: (_scope, key) => ({
      rollContext: {
        actorUuid: "Actor.attacker",
        tokenUuid: "Scene.scene.Token.attacker",
        targetUuids: [actor.uuid]
      },
      actionRoll: {
        request: { target: { actorUuid: actor.uuid } },
        result: { isSuccess }
      }
    })[key] ?? null
  });

  assert.deepEqual(
    resolveLatestDamageReactionContext(actor, source, [
      createAttackMessage("miss", false),
      createAttackMessage("hit", true)
    ]),
    {
      type: "incoming-attack-miss",
      sourceDamageMessageUuid: "ChatMessage.miss",
      targetActorUuid: "Actor.attacker",
      targetUuid: "Scene.scene.Token.attacker"
    }
  );

  const miss = createAttackMessage("reserved-miss", false);
  const reaction = {
    id: "reaction",
    uuid: "ChatMessage.reaction",
    getFlag: (_scope, key) => ({
      reactionContext: { sourceDamageMessageUuid: miss.uuid },
      damageApplications: [{ undone: false }]
    })[key] ?? null
  };
  assert.equal(resolveLatestDamageReactionContext(actor, source, [miss, reaction]), null);
});

test("Counterstrike Technique requires Attack Stance and uses half regular close damage", () => {
  const actor = {
    uuid: "Actor.defender",
    effects: [{
      flags: {
        "marvel-multiverse": {
          powerStance: "attack"
        }
      }
    }]
  };
  const source = {
    system: {
      activation: {
        reactionType: "incoming-close-damage",
        requiredStance: "attack"
      }
    }
  };
  const damageMessage = {
    id: "close-damage",
    uuid: "ChatMessage.close-damage",
    getFlag: (_scope, key) => ({
      rollContext: { attackKind: "close" },
      actionDamage: {
        attackerUuid: "Actor.attacker",
        targetUuid: actor.uuid,
        damage: { damageType: "health", baseDamage: 21 },
        apply: { success: true, appliedDamage: 42, previousValue: 90 }
      }
    })[key] ?? null
  };

  assert.deepEqual(
    resolveLatestDamageReactionContext(actor, source, [damageMessage]),
    {
      type: "incoming-close-damage",
      sourceDamageMessageUuid: "ChatMessage.close-damage",
      appliedDamage: 42,
      previousValue: 90,
      targetActorUuid: "Actor.attacker",
      responseDamage: 10
    }
  );

  actor.effects = [];
  assert.equal(resolveLatestDamageReactionContext(actor, source, [damageMessage]), null);
});

test("Reverse-Momentum Throw requires Defense Stance and uses half hypothetical miss damage", () => {
  const actor = {
    uuid: "Actor.defender",
    effects: [{
      flags: {
        "marvel-multiverse": {
          powerStance: "defense"
        }
      }
    }]
  };
  const source = {
    system: {
      activation: {
        reactionType: "incoming-close-miss",
        requiredStance: "defense"
      }
    }
  };
  const missMessage = {
    id: "close-miss",
    uuid: "ChatMessage.close-miss",
    getFlag: (_scope, key) => ({
      rollContext: {
        actorUuid: "Actor.attacker",
        attackKind: "close",
        targetUuids: [actor.uuid]
      },
      actionRoll: {
        request: { target: { actorUuid: actor.uuid } },
        result: { isSuccess: false }
      },
      damageContext: {
        finalDamage: 19
      }
    })[key] ?? null
  };

  assert.deepEqual(
    resolveLatestDamageReactionContext(actor, source, [missMessage]),
    {
      type: "incoming-close-miss",
      sourceDamageMessageUuid: "ChatMessage.close-miss",
      targetActorUuid: "Actor.attacker",
      responseDamage: 9,
      hypotheticalDamage: 19
    }
  );
});

test("Riposte accepts a close miss even when the missed attack had no positive hypothetical damage", () => {
  const actor = { uuid: "Actor.defender", effects: [] };
  const source = {
    system: {
      attack: true,
      activation: {
        reactionType: "incoming-close-miss"
      }
    }
  };
  const missMessage = {
    id: "close-miss",
    uuid: "ChatMessage.close-miss",
    getFlag: (_scope, key) => ({
      rollContext: {
        actorUuid: "Actor.attacker",
        tokenUuid: "Scene.scene.Token.attacker",
        attackKind: "close",
        targetUuids: [actor.uuid]
      },
      actionRoll: {
        request: { target: { actorUuid: actor.uuid } },
        result: { isSuccess: false }
      },
      damageContext: {
        finalDamage: -3
      }
    })[key] ?? null
  };

  assert.deepEqual(
    resolveLatestDamageReactionContext(actor, source, [missMessage]),
    {
      type: "incoming-close-miss",
      sourceDamageMessageUuid: "ChatMessage.close-miss",
      targetActorUuid: "Actor.attacker",
      targetUuid: "Scene.scene.Token.attacker",
      responseDamage: 0,
      hypotheticalDamage: -3
    }
  );
});

test("Exploit binds to the latest outgoing Fantastic weapon damage", () => {
  const actor = { uuid: "Actor.attacker" };
  const source = {
    system: {
      activation: {
        reactionType: "outgoing-weapon-fantastic-damage"
      }
    }
  };
  const previousFromUuidSync = globalThis.fromUuidSync;
  globalThis.fromUuidSync = () => ({
    type: "power",
    system: { powerSet: "Melee Weapons" }
  });
  const damageMessage = {
    id: "fantastic-damage",
    uuid: "ChatMessage.fantastic-damage",
    getFlag: (_scope, key) => ({
      rollContext: {
        actorUuid: actor.uuid,
        itemUuid: "Item.vicious-attack",
        targetUuids: ["Token.target"]
      },
      actionRoll: {
        result: { isFantastic: true }
      },
      actionDamage: {
        attackerUuid: actor.uuid,
        targetUuid: "Actor.target",
        apply: { success: true, appliedDamage: 18 }
      }
    })[key] ?? null
  };

  try {
    assert.deepEqual(
      resolveLatestDamageReactionContext(actor, source, [damageMessage]),
      {
        type: "outgoing-weapon-fantastic-damage",
        sourceDamageMessageUuid: "ChatMessage.fantastic-damage",
        targetActorUuid: "Actor.target",
        targetUuid: "Token.target",
        appliedDamage: 18
      }
    );
  } finally {
    globalThis.fromUuidSync = previousFromUuidSync;
  }
});

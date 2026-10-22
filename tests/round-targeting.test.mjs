import test from "node:test";
import assert from "node:assert/strict";

const {
  resolveOncePerRoundTargetActorUuids
} = await import("../lib/services/round-targeting.mjs");

function message({ round = 3, itemUuid = "Actor.attacker.Item.assault", undone = false } = {}) {
  return {
    getFlag: (_scope, key) => ({
      rollContext: {
        actorUuid: "Actor.attacker",
        itemUuid,
        combatContext: {
          combatId: "combat-1",
          round
        }
      },
      damageApplications: [{
        source: "action-roll",
        undone,
        targets: [
          { actorUuid: "Actor.target-a", success: true },
          { actorUuid: "Actor.target-b", success: false }
        ]
      }]
    })[key] ?? null
  };
}

test("once-per-round targeting excludes successfully affected targets in the current round", () => {
  const excluded = resolveOncePerRoundTargetActorUuids(
    { uuid: "Actor.attacker" },
    {
      uuid: "Actor.attacker.Item.assault",
      system: { targeting: { oncePerRound: true } }
    },
    {
      combatContext: { combatId: "combat-1", round: 3 },
      messages: [
        message(),
        message({ round: 2 }),
        message({ itemUuid: "Actor.attacker.Item.other" }),
        message({ undone: true })
      ]
    }
  );

  assert.deepEqual([...excluded], ["Actor.target-a"]);
});

test("ordinary targeting does not consult the round ledger", () => {
  const excluded = resolveOncePerRoundTargetActorUuids(
    { uuid: "Actor.attacker" },
    {
      uuid: "Actor.attacker.Item.assault",
      system: { targeting: { oncePerRound: false } }
    },
    {
      combatContext: { combatId: "combat-1", round: 3 },
      messages: [message()]
    }
  );

  assert.equal(excluded.size, 0);
});

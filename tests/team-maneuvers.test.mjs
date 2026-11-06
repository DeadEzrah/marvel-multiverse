import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  activateTeamManeuver,
  adjustTeamResource,
  evaluateTeamManeuverEligibility,
  getTeamResources,
  normalizeTeamAlignment,
  normalizeTeamManeuver,
  setTeamResource,
  undoTeamManeuver,
} from "../lib/team-maneuvers.mjs";

function mockActor(id, { focus = 20, rank = 3, tags = [], teamResources = [] } = {}) {
  return {
    id,
    uuid: `Actor.${id}`,
    name: id,
    type: "character",
    isOwner: true,
    system: {
      focus: { value: focus, max: focus },
      karma: { value: 3, max: 3 },
      attributes: { rank: { value: rank, mode: "standard", scale: 0 } },
      tags,
      teamResources,
      teamManeuver: {
        maneuverType: "",
        level: 1,
        alignment: "any",
        participantUuids: [],
        transactions: [],
      },
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const parts = path.split(".");
        let target = this;
        for (const part of parts.slice(0, -1)) target = target[part] ??= {};
        target[parts.at(-1)] = value;
      }
    },
  };
}

function resolver(...actors) {
  const documents = new Map(actors.map((actor) => [actor.uuid, actor]));
  return async (uuid) => documents.get(uuid) ?? null;
}

test("team resources normalize, clamp, and update by stable id", async () => {
  const actor = mockActor("leader");
  await setTeamResource(actor, { id: "plot", label: "Plot Pool", alignment: "villain", value: 8, max: 5 });
  assert.deepEqual(getTeamResources(actor), [{
    id: "plot",
    label: "Plot Pool",
    alignment: "villain",
    value: 5,
    max: 5,
  }]);
  assert.equal((await adjustTeamResource(actor, "plot", -2)).value, 3);
  assert.equal(normalizeTeamAlignment(" HERO "), "hero");
  assert.equal(normalizeTeamAlignment("unsupported"), "any");
});

test("maneuver metadata stays generic and eligibility reports participant failures", () => {
  const eligible = mockActor("eligible", { rank: 4, tags: [{ name: "Coordinated" }] });
  const ineligible = mockActor("ineligible", { rank: 1 });
  const maneuver = normalizeTeamManeuver({
    maneuverType: "Custom Setup",
    level: 2,
    alignment: "hero",
    participantUuids: [eligible.uuid, ineligible.uuid],
    cost: { mode: "individual", resource: "focus", amount: 4 },
    eligibility: { minimumParticipants: 2, minimumRank: 2, requiredTags: ["coordinated"] },
    duration: { value: 1, unit: "round" },
    effects: [{ key: "author-defined", value: 2 }],
  });
  const result = evaluateTeamManeuverEligibility(maneuver, [eligible, ineligible]);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), ["rank-too-low", "required-tags-missing"]);
  assert.deepEqual(maneuver.duration, { value: 1, unit: "round" });
  assert.deepEqual(maneuver.effects, [{ key: "author-defined", value: 2 }]);
});

test("individual costs create a durable transaction and undo exact resource changes", async () => {
  const leader = mockActor("leader", { focus: 18 });
  const ally = mockActor("ally", { focus: 12 });
  const fromUuid = resolver(leader, ally);
  const transaction = await activateTeamManeuver(leader, {
    id: "original-maneuver",
    name: "Coordinated Action",
    alignment: "hero",
    participantUuids: [leader.uuid, ally.uuid],
    cost: { mode: "individual", resource: "focus", amount: 5 },
    eligibility: { minimumParticipants: 2 },
    duration: { value: 1, unit: "round" },
    effects: [{ type: "roll-modifier", value: "edge" }],
  }, { fromUuid });

  assert.equal(leader.system.focus.value, 13);
  assert.equal(ally.system.focus.value, 7);
  assert.equal(transaction.mutations.length, 2);
  assert.equal(leader.system.teamManeuver.transactions[0].id, transaction.id);
  assert.deepEqual(transaction.participantUuids, [leader.uuid, ally.uuid]);
  assert.deepEqual(transaction.effects, [{ type: "roll-modifier", value: "edge" }]);

  const undone = await undoTeamManeuver(leader, transaction.id, { fromUuid, reason: "test" });
  assert.equal(leader.system.focus.value, 18);
  assert.equal(ally.system.focus.value, 12);
  assert.equal(undone.undone, true);
  assert.equal(undone.undoneReason, "test");
});

test("pooled team resource costs use a shared payer and safe undo rejects drift", async () => {
  const leader = mockActor("leader", {
    teamResources: [{ id: "shared", label: "Shared", alignment: "any", value: 10, max: 10 }],
  });
  const ally = mockActor("ally");
  const fromUuid = resolver(leader, ally);
  const transaction = await activateTeamManeuver(leader, {
    participantUuids: [leader.uuid, ally.uuid],
    cost: { mode: "pooled", resource: "team:shared", amount: 6, payerUuid: leader.uuid },
  }, { fromUuid });
  assert.equal(getTeamResources(leader)[0].value, 4);

  await adjustTeamResource(leader, "shared", 1);
  await assert.rejects(
    undoTeamManeuver(leader, transaction.id, { fromUuid }),
    /Cannot safely undo/u,
  );
  assert.equal(getTeamResources(leader)[0].value, 5);
  assert.equal(leader.system.teamManeuver.transactions[0].undone, false);
});

test("pooled allocations split an exact cost across participants", async () => {
  const leader = mockActor("leader", { focus: 10 });
  const ally = mockActor("ally", { focus: 10 });
  const fromUuid = resolver(leader, ally);
  const transaction = await activateTeamManeuver(leader, {
    participantUuids: [leader.uuid, ally.uuid],
    cost: {
      mode: "pooled",
      resource: "focus",
      amount: 6,
      allocations: [
        { actorUuid: leader.uuid, amount: 2 },
        { actorUuid: ally.uuid, amount: 4 },
      ],
    },
  }, { fromUuid });
  assert.equal(leader.system.focus.value, 8);
  assert.equal(ally.system.focus.value, 6);
  assert.deepEqual(transaction.mutations.map(({ actorUuid, amount }) => ({ actorUuid, amount })), [
    { actorUuid: leader.uuid, amount: 2 },
    { actorUuid: ally.uuid, amount: 4 },
  ]);
});

test("actor models retain legacy fields and add executable maneuver storage", async () => {
  const documents = await readFile(new URL("../lib/documents.mjs", import.meta.url), "utf8");
  const hooks = await readFile(new URL("../lib/hooks.mjs", import.meta.url), "utf8");
  assert.match(documents, /schema\.teamResources = new fields\.ArrayField/u);
  for (const field of ["maneuverType", "level", "alignment", "participantUuids", "cost", "eligibility", "duration", "effects", "transactions"]) {
    assert.match(documents, new RegExp(`${field}:`, "u"), field);
  }
  assert.match(hooks, /api\.activateTeamManeuver/u);
  assert.match(hooks, /api\.undoTeamManeuver/u);
});

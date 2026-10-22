import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { resolveTargetingConfig } = await import("../lib/services/action-roll.mjs");
const { resolveDamage, resolveDamageConfig } = await import("../lib/services/damage-resolver.mjs");
const { resolveAreaTargetingConfig } = await import("../lib/services/area-targeting.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Super-Strength/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const powers = Object.fromEntries(await Promise.all([
  "banging-heads.json",
  "clobber.json",
  "crushing-grip.json",
  "ground-shaking-stomp.json",
  "immovable.json",
  "jump-1.json",
  "jump-2.json",
  "jump-3.json",
  "quick-toss.json",
  "smash.json",
  "unrelenting-smash.json"
].map(async (fileName) => [fileName, await loadPower(fileName)])));

const attacker = {
  system: {
    abilities: {
      mle: { value: 4, damageMultiplier: 2 },
      agl: { value: 4, damageMultiplier: 2 }
    },
    attributes: { rank: { value: 4 } },
    reach: 2
  }
};
const target = { system: { healthDamageReduction: 0 } };

function damage(source, isFantastic, focusAmount = null) {
  return resolveDamage({
    attacker,
    target,
    source,
    rollContext: { ability: source.system.ability, focusAmount },
    rollResult: { isSuccess: true, isFantastic, marvelDie: 3 },
    config: resolveDamageConfig(source)
  }).finalDamage;
}

test("Super-Strength core strikes have exact targeting and damage", () => {
  const banging = powers["banging-heads.json"];
  const clobber = powers["clobber.json"];
  const smash = powers["smash.json"];

  assert.equal(resolveTargetingConfig(banging).minCount, 2);
  assert.equal(resolveDamageConfig(banging).requireAllTargetsHit, true);
  assert.equal(damage(banging, false), 10);
  assert.equal(damage(banging, true), 10);
  assert.equal(damage(clobber, false), 10);
  assert.equal(damage(clobber, true), 20);
  assert.equal(damage(smash, false, 5), 12);
  assert.equal(damage(smash, true, 5), 24);
});

test("Super-Strength areas scale from Reach and Rank and deal half or full damage", () => {
  const stomp = powers["ground-shaking-stomp.json"];
  const unrelenting = powers["unrelenting-smash.json"];

  assert.equal(resolveAreaTargetingConfig({ ...stomp, actor: attacker }).distance, 6);
  assert.equal(resolveAreaTargetingConfig({ ...unrelenting, actor: attacker }).distance, 2);
  assert.equal(resolveTargetingConfig({ ...unrelenting, actor: attacker }).count, 999);
  assert.equal(unrelenting.system.targeting.oncePerRound, true);
  assert.equal(damage(stomp, false), 5);
  assert.equal(damage(stomp, true), 10);
  assert.equal(damage(unrelenting, false), 5);
  assert.equal(damage(unrelenting, true), 10);
});

test("grab reactions and permanent movement records retain their special rules", () => {
  const crushing = powers["crushing-grip.json"];
  const quickToss = powers["quick-toss.json"];
  const immovable = powers["immovable.json"];
  const jump2 = powers["jump-2.json"];
  const jump3 = powers["jump-3.json"];

  assert.equal(resolveTargetingConfig(crushing).prerequisites[0].value, "grappled");
  assert.equal(damage(crushing, false), 10);
  assert.equal(damage(crushing, true), 20);
  assert.equal(damage(quickToss, false), 10);
  assert.equal(damage(quickToss, true), 20);
  assert.equal(immovable.system.activation.mode, "utility");
  assert.equal(jump2.effects[0].changes.find((change) => change.key.endsWith(".calc")).value, "rank-runspeed");
  assert.deepEqual(
    jump2.effects[0].changes.find((change) => change.key.endsWith(".noncom")),
    { key: "system.movement.jump.noncom", mode: 5, value: 3, priority: 20 }
  );
  assert.equal(jump3.effects[0].changes.find((change) => change.key.endsWith(".calc")).value, "rank-runspeed");
  assert.deepEqual(
    jump3.effects[0].changes.find((change) => change.key.endsWith(".noncom")),
    { key: "system.movement.jump.noncom", mode: 5, value: 50, priority: 30 }
  );
  for (const jump of [powers["jump-1.json"], jump2, jump3]) {
    assert.match(jump._id, /^[A-Za-z0-9]{16}$/);
    assert.equal(jump.effects[0].origin, `Item.${jump._id}`);
    assert.equal(jump._key, `!items!${jump._id}`);
  }
});

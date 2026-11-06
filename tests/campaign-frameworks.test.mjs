import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addCampaignEntry,
  adjustCampaignValue,
  getCampaignActorUuids,
  linkCampaignActor,
  normalizeCampaignEntry,
  undoCampaignTransaction,
  unlinkCampaignActor,
} from "../lib/campaign-frameworks.mjs";

function setProperty(target, path, value) {
  const parts = path.replace(/^system\./u, "").split(".");
  let current = target.system;
  while (parts.length > 1) {
    const part = parts.shift();
    current[part] ??= {};
    current = current[part];
  }
  current[parts[0]] = value;
}

function mockFramework() {
  return {
    type: "campaignFramework",
    isOwner: true,
    system: {
      responsibilities: [],
      resources: [],
      reputations: [],
      progressions: [],
      henchmenGroups: [],
      battleObjectives: [],
      actorUuids: [],
      transactions: [],
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) setProperty(this, path, value);
    },
  };
}

test("campaign entries normalize generic bounded state without book mechanics", () => {
  const reputation = normalizeCampaignEntry("reputations", {
    id: "public",
    label: " Public ",
    scope: "general",
    value: 12,
    min: -2,
    max: 5,
  });
  assert.equal(reputation.label, "Public");
  assert.equal(reputation.value, 5);
  assert.equal(reputation.min, -2);
  assert.equal(reputation.max, 5);

  const objective = normalizeCampaignEntry("battleObjectives", {
    progress: -1,
    target: 3,
  });
  assert.equal(objective.progress, 0);
  assert.equal(objective.target, 3);
  assert.ok(objective.id);
});

test("campaign mutations enforce bounds and record safely undoable transactions", async () => {
  const framework = mockFramework();
  await addCampaignEntry(framework, "resources", {
    id: "plot",
    label: "Plot Pool",
    value: 1,
    min: 0,
    max: 3,
  });

  const result = await adjustCampaignValue(framework, "resources", "plot", 10, { reason: "table decision" });
  assert.equal(result.value, 3);
  assert.equal(framework.system.resources[0].value, 3);
  assert.equal(framework.system.transactions.length, 1);
  assert.equal(framework.system.transactions[0].reason, "table decision");

  await undoCampaignTransaction(framework, result.transaction.id);
  assert.equal(framework.system.resources[0].value, 1);
  assert.equal(framework.system.transactions[0].undone, true);
  await assert.rejects(() => undoCampaignTransaction(framework, result.transaction.id), /already undone/u);
});

test("campaign undo rejects drift and newer changes", async () => {
  const framework = mockFramework();
  await addCampaignEntry(framework, "progressions", {
    id: "study",
    label: "Study",
    progress: 0,
    min: 0,
    max: 4,
  });
  const first = await adjustCampaignValue(framework, "progressions", "study", 1);
  await adjustCampaignValue(framework, "progressions", "study", 1);
  await assert.rejects(() => undoCampaignTransaction(framework, first.transaction.id), /newer transaction/u);

  const current = framework.system.transactions.at(-1);
  framework.system.progressions[0].progress = 4;
  await assert.rejects(() => undoCampaignTransaction(framework, current.id), /has changed/u);
});

test("campaign framework actor linkage is permission checked and de-duplicated", async () => {
  const framework = mockFramework();
  await linkCampaignActor(framework, "Actor.hero");
  await linkCampaignActor(framework, "Actor.hero");
  assert.deepEqual(getCampaignActorUuids(framework.system), ["Actor.hero"]);
  await unlinkCampaignActor(framework, "Actor.hero");
  assert.deepEqual(framework.system.actorUuids, []);

  framework.isOwner = false;
  await assert.rejects(() => addCampaignEntry(framework, "resources"), /permission/u);
});

test("Foundry registers and authors first-class Campaign Framework Items", async () => {
  const system = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));
  const bootstrap = await readFile(new URL("../lib/bootstrap.mjs", import.meta.url), "utf8");
  const documents = await readFile(new URL("../lib/documents.mjs", import.meta.url), "utf8");
  const sheet = await readFile(new URL("../templates/item/item-campaignFramework-sheet.hbs", import.meta.url), "utf8");
  const actorItems = await readFile(new URL("../templates/actor/parts/actor-items.hbs", import.meta.url), "utf8");

  assert.ok(Object.keys(system.documentTypes.Item).includes("campaignFramework"));
  assert.match(bootstrap, /campaignFramework:\s*DocumentMarvelMultiverseCampaignFramework/u);
  assert.match(documents, /class MarvelMultiverseCampaignFramework extends MarvelMultiverseItemBase/u);
  for (const field of [
    "system.responsibilities",
    "system.resources",
    "system.reputations",
    "system.progressions",
    "system.henchmenGroups",
    "system.largeBattle",
    "system.battleObjectives",
    "system.actorUuids",
  ]) {
    assert.match(sheet, new RegExp(field.replaceAll(".", "\\."), "u"), field);
  }
  assert.match(actorItems, /campaignFrameworks/u);
});

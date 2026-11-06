export const CAMPAIGN_FRAMEWORK_TYPES = Object.freeze({
  general: "General Campaign",
  responsibility: "Personal Responsibilities",
  plotResource: "Plot Resource",
  reputation: "Reputation",
  progression: "Schooling / Progression",
  henchmen: "Henchmen",
  largeBattle: "Large Battle",
});

export const CAMPAIGN_COLLECTIONS = Object.freeze({
  responsibilities: { value: "progress", min: "min", max: "max" },
  resources: { value: "value", min: "min", max: "max" },
  reputations: { value: "value", min: "min", max: "max" },
  progressions: { value: "progress", min: "min", max: "max" },
  henchmenGroups: { value: "current", min: "min", max: "max" },
  battleObjectives: { value: "progress", min: "min", max: "target" },
});

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function makeId(prefix = "entry") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function clone(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function assertEditableFramework(item) {
  if (item?.type !== "campaignFramework") throw new Error("The selected Item is not a Campaign Framework.");
  if (!item.isOwner && !globalThis.game?.user?.isGM) {
    throw new Error("You do not have permission to update this Campaign Framework.");
  }
  if (typeof item.update !== "function") throw new Error("The Campaign Framework cannot be updated.");
}

function getCollection(item, collection) {
  if (!Object.hasOwn(CAMPAIGN_COLLECTIONS, collection)) throw new Error("Unsupported campaign collection.");
  return clone(Array.isArray(item.system?.[collection]) ? item.system[collection] : []);
}

function normalizeBounds(entry, config) {
  const min = integer(entry?.[config.min], 0);
  const max = Math.max(min, integer(entry?.[config.max], min));
  const value = Math.min(max, Math.max(min, integer(entry?.[config.value], min)));
  return { min, max, value };
}

export function normalizeCampaignEntry(collection, entry = {}) {
  const config = CAMPAIGN_COLLECTIONS[collection];
  if (!config) throw new Error("Unsupported campaign collection.");
  const bounds = normalizeBounds(entry, config);
  return {
    ...clone(entry),
    id: String(entry.id ?? "").trim() || makeId(collection),
    label: String(entry.label ?? "").trim() || "New Entry",
    notes: String(entry.notes ?? "").trim(),
    [config.min]: bounds.min,
    [config.max]: bounds.max,
    [config.value]: bounds.value,
  };
}

export function getCampaignActorUuids(framework = {}) {
  return [...new Set((framework.actorUuids ?? []).filter((uuid) => typeof uuid === "string" && uuid.trim()))];
}

export async function addCampaignEntry(item, collection, entry = {}) {
  assertEditableFramework(item);
  const entries = getCollection(item, collection);
  entries.push(normalizeCampaignEntry(collection, entry));
  await item.update({ [`system.${collection}`]: entries });
  return entries;
}

export async function removeCampaignEntry(item, collection, entryId) {
  assertEditableFramework(item);
  const entries = getCollection(item, collection);
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index >= 0) entries.splice(index, 1);
  await item.update({ [`system.${collection}`]: entries });
  return entries;
}

export async function linkCampaignActor(item, actorUuid) {
  assertEditableFramework(item);
  const uuid = String(actorUuid ?? "").trim();
  if (!uuid) throw new Error("An Actor UUID is required.");
  const actorUuids = getCampaignActorUuids(item.system);
  if (!actorUuids.includes(uuid)) actorUuids.push(uuid);
  await item.update({ "system.actorUuids": actorUuids });
  return actorUuids;
}

export async function unlinkCampaignActor(item, actorUuid) {
  assertEditableFramework(item);
  const actorUuids = getCampaignActorUuids(item.system).filter((uuid) => uuid !== actorUuid);
  await item.update({ "system.actorUuids": actorUuids });
  return actorUuids;
}

export async function openCampaignLink(uuid, { fromUuid = globalThis.fromUuid } = {}) {
  const targetUuid = String(uuid ?? "").trim();
  if (!targetUuid || typeof fromUuid !== "function") return null;
  const document = await fromUuid(targetUuid);
  document?.sheet?.render?.(true);
  return document ?? null;
}

export async function adjustCampaignValue(item, collection, entryId, amount, options = {}) {
  assertEditableFramework(item);
  const config = CAMPAIGN_COLLECTIONS[collection];
  const entries = getCollection(item, collection);
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) throw new Error("Campaign entry not found.");

  const entry = normalizeCampaignEntry(collection, entries[index]);
  const bounds = normalizeBounds(entry, config);
  const before = bounds.value;
  const after = Math.min(bounds.max, Math.max(bounds.min, before + integer(amount)));
  if (after === before) return { updated: false, value: before, transaction: null };

  entry[config.value] = after;
  entries[index] = entry;
  const transactions = clone(Array.isArray(item.system?.transactions) ? item.system.transactions : []);
  const transaction = {
    id: makeId("campaign-transaction"),
    collection,
    entryId,
    field: config.value,
    before,
    after,
    reason: String(options.reason ?? "").trim(),
    userId: globalThis.game?.user?.id ?? "",
    createdAt: new Date().toISOString(),
    undone: false,
  };
  transactions.push(transaction);
  await item.update({
    [`system.${collection}`]: entries,
    "system.transactions": transactions,
  });
  globalThis.Hooks?.callAll?.("marvel-multiverse.campaignFrameworkChanged", item, transaction);
  return { updated: true, value: after, transaction };
}

export async function undoCampaignTransaction(item, transactionId) {
  assertEditableFramework(item);
  const transactions = clone(Array.isArray(item.system?.transactions) ? item.system.transactions : []);
  const index = transactions.findIndex((transaction) => transaction.id === transactionId);
  const transaction = transactions[index];
  if (!transaction || transaction.undone) throw new Error("Campaign transaction is unavailable or already undone.");

  const config = CAMPAIGN_COLLECTIONS[transaction.collection];
  if (!config || config.value !== transaction.field) throw new Error("Campaign transaction target is invalid.");
  const laterTransaction = transactions.slice(index + 1).some((candidate) =>
    !candidate.undone
    && candidate.collection === transaction.collection
    && candidate.entryId === transaction.entryId
    && candidate.field === transaction.field
  );
  if (laterTransaction) throw new Error("A newer transaction changed this campaign entry.");

  const entries = getCollection(item, transaction.collection);
  const entryIndex = entries.findIndex((entry) => entry.id === transaction.entryId);
  if (entryIndex < 0 || integer(entries[entryIndex]?.[transaction.field]) !== integer(transaction.after)) {
    throw new Error("The campaign entry has changed; undo was not applied.");
  }

  entries[entryIndex][transaction.field] = integer(transaction.before);
  transactions[index] = {
    ...transaction,
    undone: true,
    undoneAt: new Date().toISOString(),
    undoneBy: globalThis.game?.user?.id ?? "",
  };
  await item.update({
    [`system.${transaction.collection}`]: entries,
    "system.transactions": transactions,
  });
  globalThis.Hooks?.callAll?.("marvel-multiverse.campaignFrameworkUndone", item, transactions[index]);
  return transactions[index];
}

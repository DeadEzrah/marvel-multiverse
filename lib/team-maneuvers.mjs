export const TEAM_MANEUVER_ALIGNMENTS = Object.freeze({
  any: "Any",
  hero: "Hero",
  villain: "Villain",
  neutral: "Neutral",
});

export const TEAM_MANEUVER_COST_MODES = Object.freeze({
  individual: "Individual",
  pooled: "Pooled",
});

const SYSTEM_ID = "marvel-multiverse";

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function transactionId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `team-maneuver-${uuid}` : `team-maneuver-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function actorFromDocument(document) {
  return document?.actor ?? document;
}

function actorUuid(actor) {
  return actor?.uuid ?? (actor?.id ? `Actor.${actor.id}` : "");
}

function assertEditable(actor) {
  if (!actor || typeof actor.update !== "function") throw new Error("A writable participant Actor is required.");
  if (!actor.isOwner && !globalThis.game?.user?.isGM) throw new Error(`You do not have permission to update ${actor.name || actorUuid(actor)}.`);
}

export function normalizeTeamAlignment(value) {
  const alignment = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(TEAM_MANEUVER_ALIGNMENTS, alignment) ? alignment : "any";
}

export function normalizeTeamResource(resource = {}) {
  const max = integer(resource.max);
  return {
    id: String(resource.id ?? "").trim(),
    label: String(resource.label ?? resource.id ?? "").trim(),
    alignment: normalizeTeamAlignment(resource.alignment),
    value: Math.min(max, integer(resource.value)),
    max,
  };
}

export function getTeamResources(actor) {
  return (Array.isArray(actor?.system?.teamResources) ? actor.system.teamResources : [])
    .map(normalizeTeamResource)
    .filter((resource) => resource.id);
}

export async function setTeamResource(actor, resource) {
  assertEditable(actor);
  const normalized = normalizeTeamResource(resource);
  if (!normalized.id) throw new Error("A team resource id is required.");
  const resources = getTeamResources(actor);
  const index = resources.findIndex((entry) => entry.id === normalized.id);
  if (index >= 0) resources[index] = normalized;
  else resources.push(normalized);
  await actor.update({ "system.teamResources": resources });
  return normalized;
}

export async function adjustTeamResource(actor, resourceId, amount) {
  assertEditable(actor);
  const resources = getTeamResources(actor);
  const index = resources.findIndex((entry) => entry.id === resourceId);
  if (index < 0) throw new Error(`Team resource "${resourceId}" was not found.`);
  resources[index] = normalizeTeamResource({
    ...resources[index],
    value: resources[index].value + Math.trunc(Number(amount) || 0),
  });
  await actor.update({ "system.teamResources": resources });
  return resources[index];
}

export function normalizeTeamManeuver(definition = {}) {
  const legacyType = definition.maneuverType ?? definition.type ?? "";
  const cost = definition.cost && typeof definition.cost === "object" ? definition.cost : {};
  const mode = Object.hasOwn(TEAM_MANEUVER_COST_MODES, String(cost.mode ?? "").toLowerCase())
    ? String(cost.mode).toLowerCase()
    : "individual";
  return {
    id: String(definition.id ?? "").trim(),
    name: String(definition.name ?? legacyType).trim(),
    maneuverType: String(legacyType).trim(),
    level: Math.max(1, integer(definition.level, 1)),
    alignment: normalizeTeamAlignment(definition.alignment),
    participantUuids: uniqueStrings(definition.participantUuids),
    cost: {
      mode,
      resource: String(cost.resource ?? "focus").trim().toLowerCase(),
      amount: integer(cost.amount),
      payerUuid: String(cost.payerUuid ?? "").trim(),
      allocations: Array.isArray(cost.allocations)
        ? cost.allocations.map((entry) => ({
          actorUuid: String(entry?.actorUuid ?? "").trim(),
          amount: integer(entry?.amount),
        })).filter((entry) => entry.actorUuid && entry.amount)
        : [],
    },
    eligibility: definition.eligibility && typeof definition.eligibility === "object"
      ? structuredCloneSafe(definition.eligibility)
      : {},
    duration: definition.duration && typeof definition.duration === "object"
      ? structuredCloneSafe(definition.duration)
      : {},
    effects: Array.isArray(definition.effects) ? structuredCloneSafe(definition.effects) : [],
    metadata: definition.metadata && typeof definition.metadata === "object"
      ? structuredCloneSafe(definition.metadata)
      : {},
  };
}

function structuredCloneSafe(value) {
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Foundry DataModel proxies are not always structured-cloneable.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function actorRank(actor) {
  const rank = actor?.system?.attributes?.rank ?? {};
  return Number(rank.mode === "rank-x" ? rank.scale : rank.value) || 0;
}

function actorTags(actor) {
  const tags = actor?.system?.tags ?? [];
  return new Set(tags.flatMap((tag) => [
    typeof tag === "string" ? tag : tag?.name,
    tag?.system?.slug,
  ]).map((tag) => String(tag ?? "").trim().toLowerCase()).filter(Boolean));
}

export function evaluateTeamManeuverEligibility(definition, participants) {
  const maneuver = normalizeTeamManeuver(definition);
  const eligibility = maneuver.eligibility;
  const actors = (Array.isArray(participants) ? participants : []).map(actorFromDocument).filter(Boolean);
  const issues = [];
  const minimum = integer(eligibility.minimumParticipants, 1);
  const maximum = eligibility.maximumParticipants == null ? null : integer(eligibility.maximumParticipants);
  if (actors.length < minimum) issues.push({ code: "too-few-participants", minimum, actual: actors.length });
  if (maximum !== null && actors.length > maximum) issues.push({ code: "too-many-participants", maximum, actual: actors.length });

  const minimumRank = eligibility.minimumRank == null ? null : Number(eligibility.minimumRank);
  const maximumRank = eligibility.maximumRank == null ? null : Number(eligibility.maximumRank);
  const actorTypes = uniqueStrings(eligibility.actorTypes).map((type) => type.toLowerCase());
  const requiredTags = uniqueStrings(eligibility.requiredTags).map((tag) => tag.toLowerCase());
  for (const actor of actors) {
    const uuid = actorUuid(actor);
    const rank = actorRank(actor);
    if (Number.isFinite(minimumRank) && rank < minimumRank) issues.push({ code: "rank-too-low", actorUuid: uuid, minimumRank, actual: rank });
    if (Number.isFinite(maximumRank) && rank > maximumRank) issues.push({ code: "rank-too-high", actorUuid: uuid, maximumRank, actual: rank });
    if (actorTypes.length && !actorTypes.includes(String(actor.type ?? "").toLowerCase())) {
      issues.push({ code: "actor-type-ineligible", actorUuid: uuid, actorType: actor.type });
    }
    const tags = actorTags(actor);
    const missingTags = requiredTags.filter((tag) => !tags.has(tag));
    if (missingTags.length) issues.push({ code: "required-tags-missing", actorUuid: uuid, missingTags });
  }
  return { eligible: issues.length === 0, issues, maneuver };
}

function readResource(actor, resource) {
  if (resource === "focus" || resource === "karma") return integer(actor?.system?.[resource]?.value);
  if (resource.startsWith("team:")) {
    const id = resource.slice(5);
    const entry = getTeamResources(actor).find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Team resource "${id}" was not found on ${actor.name || actorUuid(actor)}.`);
    return entry.value;
  }
  throw new Error(`Unsupported maneuver resource "${resource}".`);
}

async function writeResource(actor, resource, value) {
  if (resource === "focus" || resource === "karma") {
    await actor.update({ [`system.${resource}.value`]: value });
    return;
  }
  const id = resource.slice(5);
  const resources = getTeamResources(actor);
  const index = resources.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`Team resource "${id}" was not found on ${actor.name || actorUuid(actor)}.`);
  resources[index] = { ...resources[index], value };
  await actor.update({ "system.teamResources": resources });
}

async function resolveActors(uuids, fromUuid) {
  const actors = [];
  const resolvedUuids = new Set();
  for (const uuid of uuids) {
    const actor = actorFromDocument(await fromUuid(uuid));
    if (!actor) throw new Error(`Participant "${uuid}" could not be resolved.`);
    const uuidValue = actorUuid(actor);
    if (resolvedUuids.has(uuidValue)) throw new Error(`Participant Actor "${uuidValue}" was selected more than once.`);
    resolvedUuids.add(uuidValue);
    actors.push(actor);
  }
  return actors;
}

function buildSpends(maneuver, participants, initiator, allocations) {
  const { cost } = maneuver;
  if (!cost.amount) return [];
  if (cost.mode === "individual") {
    return combineSpends(participants.map((actor) => ({ actor, amount: cost.amount })));
  }

  const selectedAllocations = Array.isArray(allocations) && allocations.length ? allocations : cost.allocations;
  if (selectedAllocations.length) {
    const spends = selectedAllocations.map((allocation) => {
      const actor = participants.find((entry) => actorUuid(entry) === allocation.actorUuid);
      if (!actor) throw new Error(`Pooled allocation actor "${allocation.actorUuid}" is not a participant.`);
      return { actor, amount: integer(allocation.amount) };
    }).filter((entry) => entry.amount);
    if (spends.reduce((total, entry) => total + entry.amount, 0) !== cost.amount) {
      throw new Error("Pooled allocations must equal the maneuver cost.");
    }
    return combineSpends(spends);
  }

  const payerUuid = cost.payerUuid || actorUuid(initiator);
  const payer = [initiator, ...participants].find((actor) => actorUuid(actor) === payerUuid);
  if (!payer) throw new Error(`Pooled payer "${payerUuid}" could not be resolved.`);
  return [{ actor: payer, amount: cost.amount }];
}

function combineSpends(spends) {
  const combined = new Map();
  for (const spend of spends) {
    const uuid = actorUuid(spend.actor);
    const current = combined.get(uuid);
    if (current) current.amount += spend.amount;
    else combined.set(uuid, { ...spend });
  }
  return [...combined.values()];
}

function getTransactions(actor) {
  const transactions = actor?.system?.teamManeuver?.transactions;
  return Array.isArray(transactions) ? structuredCloneSafe(transactions) : [];
}

async function storeTransactions(actor, transactions) {
  await actor.update({ "system.teamManeuver.transactions": transactions });
}

export async function activateTeamManeuver(initiator, definition = {}, options = {}) {
  assertEditable(initiator);
  const maneuver = normalizeTeamManeuver(definition);
  const participantUuids = uniqueStrings(options.participantUuids ?? maneuver.participantUuids);
  const fromUuid = options.fromUuid ?? globalThis.fromUuid;
  if (typeof fromUuid !== "function") throw new Error("A UUID resolver is required.");
  const participants = await resolveActors(participantUuids, fromUuid);
  const eligibility = evaluateTeamManeuverEligibility({ ...maneuver, participantUuids }, participants);
  if (!eligibility.eligible) {
    const error = new Error("One or more participants are not eligible for this team maneuver.");
    error.issues = eligibility.issues;
    throw error;
  }

  const spends = buildSpends(maneuver, participants, initiator, options.allocations);
  const mutations = spends.map(({ actor, amount }) => {
    assertEditable(actor);
    const before = readResource(actor, maneuver.cost.resource);
    if (before < amount) throw new Error(`${actor.name || actorUuid(actor)} lacks the required ${maneuver.cost.resource}.`);
    return { actor, actorUuid: actorUuid(actor), resource: maneuver.cost.resource, before, after: before - amount, amount };
  });

  const applied = [];
  try {
    for (const mutation of mutations) {
      if (readResource(mutation.actor, mutation.resource) !== mutation.before) throw new Error("A maneuver resource changed before spending completed.");
      await writeResource(mutation.actor, mutation.resource, mutation.after);
      applied.push(mutation);
    }
  } catch (error) {
    for (const mutation of applied.reverse()) {
      if (readResource(mutation.actor, mutation.resource) === mutation.after) {
        await writeResource(mutation.actor, mutation.resource, mutation.before);
      }
    }
    throw error;
  }

  const transaction = {
    id: transactionId(),
    version: 1,
    createdAt: new Date().toISOString(),
    initiatorUuid: actorUuid(initiator),
    maneuver,
    participantUuids,
    mutations: mutations.map(({ actor: _actor, ...mutation }) => mutation),
    duration: maneuver.duration,
    effects: maneuver.effects,
    undone: false,
  };
  try {
    await storeTransactions(initiator, [...getTransactions(initiator), transaction]);
  } catch (error) {
    for (const mutation of applied.reverse()) {
      if (readResource(mutation.actor, mutation.resource) === mutation.after) {
        await writeResource(mutation.actor, mutation.resource, mutation.before);
      }
    }
    throw error;
  }
  globalThis.Hooks?.callAll?.(`${SYSTEM_ID}.teamManeuverActivated`, initiator, transaction);
  return transaction;
}

export async function undoTeamManeuver(initiator, transactionIdValue, options = {}) {
  assertEditable(initiator);
  const transactions = getTransactions(initiator);
  const index = transactions.findIndex((entry) => entry.id === transactionIdValue);
  if (index < 0) throw new Error("The team maneuver transaction was not found.");
  const transaction = transactions[index];
  if (transaction.undone) return transaction;
  const fromUuid = options.fromUuid ?? globalThis.fromUuid;
  if (typeof fromUuid !== "function") throw new Error("A UUID resolver is required.");

  const actors = new Map();
  for (const mutation of transaction.mutations ?? []) {
    const actor = actorFromDocument(await fromUuid(mutation.actorUuid));
    assertEditable(actor);
    if (readResource(actor, mutation.resource) !== mutation.after) {
      throw new Error(`Cannot safely undo: ${actor.name || mutation.actorUuid}'s ${mutation.resource} has changed.`);
    }
    actors.set(mutation.actorUuid, actor);
  }

  const restored = [];
  try {
    for (const mutation of [...(transaction.mutations ?? [])].reverse()) {
      await writeResource(actors.get(mutation.actorUuid), mutation.resource, mutation.before);
      restored.push(mutation);
    }
  } catch (error) {
    for (const mutation of restored.reverse()) {
      if (readResource(actors.get(mutation.actorUuid), mutation.resource) === mutation.before) {
        await writeResource(actors.get(mutation.actorUuid), mutation.resource, mutation.after);
      }
    }
    throw error;
  }
  transactions[index] = {
    ...transaction,
    undone: true,
    undoneAt: new Date().toISOString(),
    undoneReason: String(options.reason ?? "manual"),
  };
  try {
    await storeTransactions(initiator, transactions);
  } catch (error) {
    for (const mutation of transaction.mutations ?? []) {
      if (readResource(actors.get(mutation.actorUuid), mutation.resource) === mutation.before) {
        await writeResource(actors.get(mutation.actorUuid), mutation.resource, mutation.after);
      }
    }
    throw error;
  }
  globalThis.Hooks?.callAll?.(`${SYSTEM_ID}.teamManeuverUndone`, initiator, transactions[index]);
  return transactions[index];
}

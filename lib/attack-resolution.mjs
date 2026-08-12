import { updateChatMessageFlags } from "./chat-message-state.mjs";
import { resolveStoredTargets } from "./target-resolution.mjs";
import { getRollContext } from "./roll-context.mjs";

const ATTACK_RESOLUTION_VERSION = 1;

function createIssue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function getMessageRollContext(message) {
  const context = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext")
    : null;
  return context ?? getRollContext(message) ?? null;
}

function getAttackAbilityDefensiveValue(actor, abilityKey) {
  if (!actor || typeof actor !== "object") return null;
  const ability = actor.system?.abilities?.[abilityKey];
  if (!ability || typeof ability !== "object") return null;
  return typeof ability.defense === "number" ? ability.defense : null;
}

function getAttackTargetKey(context) {
  if (!context || typeof context !== "object") return null;
  const raw = context.attackTarget ?? context.attackTargetKey ?? context.attackAbility ?? null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function normalizeOutcome(outcome) {
  return outcome === "fantastic-hit" ? "fantastic-hit" : outcome;
}

// Convenience booleans mirroring outcome, kept alongside it so consumers can branch on plain
// booleans without re-deriving them from the outcome string.
function buildOutcomeFlags(outcome, evaluable) {
  return {
    hit: outcome === "hit" || outcome === "fantastic-hit",
    fantastic: outcome === "fantastic-hit",
    resolutionComplete: Boolean(evaluable),
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export async function compareAttackToStoredTargets(message, options = {}) {
  const resolvedOptions = {
    store: true,
    quiet: false,
    ...options,
  };

  const context = getMessageRollContext(message);
  const baseResult = {
    targets: [],
    issues: [],
    summary: { targetCount: 0, hitCount: 0, missCount: 0, unresolvedCount: 0, fantasticHitCount: 0 },
    version: ATTACK_RESOLUTION_VERSION,
  };

  if (!context) {
    baseResult.issues.push(createIssue("warning", "ROLL_CONTEXT_MISSING", "This message does not contain structured roll context.", { messageId: message?.id ?? null }));
    if (resolvedOptions.store) {
      await updateChatMessageFlags(message, { "marvel-multiverse": { attackResolution: baseResult } });
    }
    return baseResult;
  }

  const targetUuids = Array.isArray(context.targetUuids) ? context.targetUuids : [];
  const localIssues = [];
  if (!targetUuids.length) {
    baseResult.issues.push(createIssue("warning", "NO_STORED_TARGETS", "No stored targets were found for this attack.", { messageId: message?.id ?? null }));
    if (resolvedOptions.store) {
      await updateChatMessageFlags(message, { "marvel-multiverse": { attackResolution: baseResult } });
    }
    return baseResult;
  }

  const resolvedTargets = await resolveStoredTargets(message, { requireToken: false, requireActor: true, checkPermissions: true, quiet: true });
  const targetEntries = [];
  const attackTargetKey = getAttackTargetKey(context);
  const rollTotal = typeof context.rollTotal === "number" ? context.rollTotal : Number(context.rollTotal ?? NaN);
  const hasValidRollTotal = isFiniteNumber(rollTotal);
  const isFantastic = Boolean(context.isFantastic);

  if (!hasValidRollTotal) {
    localIssues.push(createIssue("warning", "ROLL_TOTAL_INVALID", "The attack roll total is missing or invalid; outcomes are unresolved unless fantastic success applies.", {
      messageId: message?.id ?? null,
      rollTotal: context.rollTotal ?? null,
    }));
  }

  for (const entry of resolvedTargets.resolved ?? []) {
    const actor = entry?.actor ?? null;
    const defenseValue = getAttackAbilityDefensiveValue(actor, attackTargetKey);
    const evaluable = Boolean(actor && attackTargetKey && typeof defenseValue === "number" && hasValidRollTotal);
    const outcome = evaluable
      ? (rollTotal >= defenseValue ? (isFantastic ? "fantastic-hit" : "hit") : "miss")
      : "unresolved";
    const normalizedOutcome = normalizeOutcome(outcome);
    targetEntries.push({
      uuid: entry?.uuid ?? null,
      name: actor?.name ?? entry?.tokenDocument?.name ?? null,
      actor,
      evaluable,
      outcome: normalizedOutcome,
      attackTarget: attackTargetKey,
      defenseAbility: attackTargetKey,
      defenseValue,
      rollTotal,
      attackTotal: rollTotal,
      isFantastic,
      ...buildOutcomeFlags(normalizedOutcome, evaluable),
    });
  }

  const buildUnresolvedEntry = (entry) => ({
    uuid: entry?.uuid ?? null,
    name: entry?.uuid ?? null,
    actor: null,
    evaluable: false,
    outcome: "unresolved",
    attackTarget: attackTargetKey,
    defenseAbility: attackTargetKey,
    defenseValue: null,
    rollTotal,
    attackTotal: rollTotal,
    isFantastic,
    ...buildOutcomeFlags("unresolved", false),
  });

  const unresolvedEntries = (resolvedTargets.missing ?? []).map(buildUnresolvedEntry);
  const inaccessibleEntries = (resolvedTargets.inaccessible ?? []).map(buildUnresolvedEntry);
  const invalidEntries = (resolvedTargets.invalid ?? []).map(buildUnresolvedEntry);

  const targets = [...targetEntries, ...unresolvedEntries, ...inaccessibleEntries, ...invalidEntries];
  const summary = {
    targetCount: targets.length,
    hitCount: targets.filter((item) => item.outcome === "hit").length,
    missCount: targets.filter((item) => item.outcome === "miss").length,
    unresolvedCount: targets.filter((item) => item.outcome === "unresolved").length,
    fantasticHitCount: targets.filter((item) => item.outcome === "fantastic-hit").length,
  };

  const result = {
    targets,
    issues: [...localIssues, ...(resolvedTargets.issues ?? []), ...(resolvedTargets.usedLegacyCurrentTargets ? [] : [])],
    summary,
    version: ATTACK_RESOLUTION_VERSION,
  };

  if (resolvedOptions.store) {
    await updateChatMessageFlags(message, { "marvel-multiverse": { attackResolution: result } });
  }

  return result;
}

export async function refreshAttackResolution(message, options = {}) {
  const before = getAttackResolution(message) ?? null;
  const after = await compareAttackToStoredTargets(message, { ...options, store: true });
  return { before, after };
}

export function getAttackResolution(message) {
  if (typeof message?.getFlag === "function") {
    const value = message.getFlag("marvel-multiverse", "attackResolution");
    if (value) return value;
  }
  return null;
}

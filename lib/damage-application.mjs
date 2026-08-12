import { updateChatMessageFlags } from "./chat-message-state.mjs";
import { getRollContext } from "./roll-context.mjs";
import { resolveStoredTargets } from "./target-resolution.mjs";
import { getDamageContext } from "./damage-calculation.mjs";
import { hasActorMutationPermission } from "./services/mutation-preflight.mjs";

const DAMAGE_APPLICATION_VERSION = 1;
const DEFAULT_DAMAGE_MODES = ["full", "half", "double", "custom"];

function createIssue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function getMessageRollContext(message) {
  const context = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext")
    : null;
  return context ?? getRollContext(message) ?? null;
}

function getMessageAttackResolution(message) {
  if (typeof message?.getFlag === "function") {
    return message.getFlag("marvel-multiverse", "attackResolution") ?? null;
  }
  return null;
}

function getDamageTotal(context, attackResolution, message) {
  const damageContext = getDamageContext(message);
  if (typeof damageContext?.finalDamage === "number") return damageContext.finalDamage;
  if (typeof context?.damage?.total === "number") return context.damage.total;
  if (typeof attackResolution?.damageTotal === "number") return attackResolution.damageTotal;
  if (typeof context?.rollTotal === "number") return context.rollTotal;
  return null;
}

function getDamageType(context) {
  const value = context?.damage?.type ?? context?.damageType ?? null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized === "health" || normalized === "focus" ? normalized : null;
}

function getDamageReduction(actor, damageType) {
  if (!actor || typeof actor !== "object") return 0;
  if (damageType === "focus") return Number(actor.system?.focusDamageReduction ?? 0) || 0;
  return Number(actor.system?.healthDamageReduction ?? 0) || 0;
}

function getResourcePath(damageType) {
  return damageType === "focus" ? "system.focus.value" : "system.health.value";
}

function clampDamageValue(value) {
  return Math.max(0, Math.floor(value));
}

function resolveDamageAmount(baseDamage, mode, customAmount = null) {
  if (mode === "half") return clampDamageValue(Math.floor(baseDamage / 2));
  if (mode === "double") return clampDamageValue(baseDamage * 2);
  if (mode === "custom") {
    if (typeof customAmount !== "number" || !Number.isFinite(customAmount)) return null;
    if (!Number.isInteger(customAmount)) return null;
    if (customAmount < 0) return null;
    return clampDamageValue(customAmount);
  }
  return clampDamageValue(baseDamage);
}

function resolveEffectiveDamage(baseAmount, damageReduction) {
  const reduction = typeof damageReduction === "number" && Number.isFinite(damageReduction)
    ? Math.max(0, Math.floor(damageReduction))
    : 0;
  return Math.max(0, clampDamageValue(baseAmount) - reduction);
}

function getEligibleTargets(message, attackResolution, options = {}) {
  const resolvedOptions = { requireHitTargets: true, ...options };
  const entries = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];
  const targets = [];
  for (const entry of entries) {
    if (!resolvedOptions.requireHitTargets) {
      targets.push(entry);
      continue;
    }
    const outcome = entry?.outcome;
    if (outcome === "hit" || outcome === "fantastic-hit") targets.push(entry);
  }
  return targets;
}

function getActorResource(actor, resourcePath) {
  if (!actor || typeof actor !== "object") return null;
  const value = foundry.utils?.getProperty?.(actor, resourcePath);
  return typeof value === "number" ? value : null;
}

function buildUpdateData(resourcePath, value) {
  const pathParts = resourcePath.split(".");
  if (pathParts.length < 2) return { [resourcePath]: value };
  const result = {};
  let current = result;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const segment = pathParts[index];
    current[segment] = {};
    current = current[segment];
  }
  current[pathParts[pathParts.length - 1]] = value;
  return result;
}

async function updateActorResource(actor, resourcePath, amount, options = {}) {
  if (!actor || typeof actor !== "object") return { success: false, reason: "actor-missing" };
  const currentValue = getActorResource(actor, resourcePath);
  if (typeof currentValue !== "number") return { success: false, reason: "resource-missing" };
  const nextValue = Math.max(0, currentValue - amount);
  const updateData = buildUpdateData(resourcePath, nextValue);
  if (typeof actor.update === "function") {
    await actor.update(updateData);
    return { success: true, previousValue: currentValue, newValue: nextValue };
  }
  if (typeof actor.parent?.update === "function") {
    await actor.parent.update(updateData);
    return { success: true, previousValue: currentValue, newValue: nextValue };
  }
  return { success: false, reason: "update-unavailable" };
}

async function resolveTargetActorEntry(targetEntry, options = {}) {
  const uuid = targetEntry?.uuid ?? null;
  if (!uuid) return { success: false, reason: "missing-uuid", targetEntry };
  if (typeof globalThis.fromUuidSync === "function") {
    const value = globalThis.fromUuidSync(uuid);
    const resolved = value && typeof value.then === "function" ? await value : value;
    if (!resolved) return { success: false, reason: "missing-target", targetEntry };
    if (resolved.documentName === "Actor") {
      return { success: true, actor: resolved, tokenDocument: null, targetEntry };
    }
    if (resolved.documentName === "Token") {
      return { success: true, actor: resolved.actor ?? null, tokenDocument: resolved, targetEntry };
    }
  }
  return { success: false, reason: "unresolved", targetEntry };
}

function getTransactionId() {
  return `damage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readDamageApplications(message) {
  const existing = message?.getFlag?.("marvel-multiverse", "damageApplications") ?? [];
  return Array.isArray(existing) ? existing : [];
}

export function hasAppliedMessageDamage(message) {
  const actionDamage = message?.getFlag?.("marvel-multiverse", "actionDamage") ?? null;
  if (actionDamage?.apply?.success && actionDamage.apply?.undone !== true) return true;
  return readDamageApplications(message).some((entry) => !entry?.undone);
}

async function recordDamageTransaction(message, transaction) {
  const applications = readDamageApplications(message);
  applications.push(transaction);
  await updateChatMessageFlags(message, { "marvel-multiverse": { damageApplications: applications } });
  return transaction;
}

export async function applyMessageDamage(message, options = {}) {
  const resolvedOptions = {
    mode: "full",
    amount: null,
    quiet: false,
    ...options,
  };

  const context = getMessageRollContext(message);
  const attackResolution = getMessageAttackResolution(message);
  const damageContext = getDamageContext(message);
  const damageType = getDamageType(context);
  const baseDamage = getDamageTotal(context, attackResolution, message);
  if (hasAppliedMessageDamage(message)) {
    return {
      success: false,
      issues: [createIssue("warning", "DAMAGE_ALREADY_APPLIED", "Damage has already been applied for this message.", { messageId: message?.id ?? null })],
      summary: { requestedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 },
      targets: { updated: [], skipped: [], failed: [] },
    };
  }
  if (!context) {
    return {
      success: false,
      issues: [createIssue("warning", "ROLL_CONTEXT_MISSING", "This message does not contain structured roll context.", { messageId: message?.id ?? null })],
      summary: { requestedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 },
      targets: { updated: [], skipped: [], failed: [] },
    };
  }
  if (!context.dealsDamage) {
    return {
      success: false,
      issues: [createIssue("warning", "DAMAGE_NOT_DEALT", "This message is not marked as dealing damage.", { messageId: message?.id ?? null })],
      summary: { requestedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 },
      targets: { updated: [], skipped: [], failed: [] },
    };
  }
  if (!damageType) {
    return {
      success: false,
      issues: [createIssue("warning", "DAMAGE_TYPE_INVALID", "No valid damage type was found for this message.", { messageId: message?.id ?? null })],
      summary: { requestedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 },
      targets: { updated: [], skipped: [], failed: [] },
    };
  }
  if (typeof baseDamage !== "number" || !Number.isFinite(baseDamage)) {
    return {
      success: false,
      issues: [createIssue("warning", "DAMAGE_TOTAL_MISSING", "No reliable numeric damage total was found for this message.", { messageId: message?.id ?? null })],
      summary: { requestedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 },
      targets: { updated: [], skipped: [], failed: [] },
    };
  }

  const eligibleTargets = getEligibleTargets(message, attackResolution);
  if (!eligibleTargets.length) {
    return {
      success: false,
      issues: [createIssue("warning", "NO_ELIGIBLE_TARGETS", "No eligible hit targets were found for damage application.", { messageId: message?.id ?? null })],
      summary: { requestedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 },
      targets: { updated: [], skipped: [], failed: [] },
    };
  }

  const mode = DEFAULT_DAMAGE_MODES.includes(resolvedOptions.mode) ? resolvedOptions.mode : "full";
  const amount = resolveDamageAmount(baseDamage, mode, resolvedOptions.amount);
  if (amount === null) {
    return {
      success: false,
      issues: [createIssue("warning", "INVALID_DAMAGE_AMOUNT", "The requested damage amount is invalid.", { messageId: message?.id ?? null })],
      summary: { requestedCount: eligibleTargets.length, updatedCount: 0, skippedCount: 0, failedCount: 0 },
      targets: { updated: [], skipped: [], failed: [] },
    };
  }

  const updated = [];
  const skipped = [];
  const failed = [];
  const transaction = {
    id: getTransactionId(),
    version: DAMAGE_APPLICATION_VERSION,
    appliedAt: Date.now(),
    appliedBy: game.user?.id ?? null,
    mode,
    damageType,
    baseDamage,
    customDamage: mode === "custom" ? resolvedOptions.amount : null,
    targets: [],
    undone: false,
  };

  for (const target of eligibleTargets) {
    const resolvedTarget = await resolveTargetActorEntry(target, { message });
    if (!resolvedTarget.success) {
      failed.push({ targetUuid: target?.uuid ?? null, reason: resolvedTarget.reason });
      continue;
    }

    const actor = resolvedTarget.actor;
    if (!hasActorMutationPermission(actor)) {
      skipped.push({ targetUuid: target?.uuid ?? null, reason: "permission-denied" });
      continue;
    }

    const resourcePath = getResourcePath(damageType);
    const damageReduction = getDamageReduction(actor, damageType);
    const targetDamage = damageContext?.targets?.find((entry) => entry?.targetUuid === target?.uuid)?.finalDamage;
    const structuredAmount = typeof targetDamage === "number" && Number.isFinite(targetDamage)
      ? resolveDamageAmount(targetDamage, mode, resolvedOptions.amount)
      : null;
    const reductionAlreadyApplied = structuredAmount !== null || damageContext?.reductionAlreadyApplied === true;
    const effectiveAmount = reductionAlreadyApplied
      ? (structuredAmount ?? amount)
      : resolveEffectiveDamage(amount, damageReduction);
    const previousValue = getActorResource(actor, resourcePath);
    const updateResult = await updateActorResource(actor, resourcePath, effectiveAmount, { message });
    if (!updateResult.success) {
      failed.push({ targetUuid: target?.uuid ?? null, reason: updateResult.reason });
      continue;
    }

    transaction.targets.push({
      targetUuid: target?.uuid ?? null,
      actorUuid: actor?.uuid ?? null,
      resourcePath,
      damageReduction,
      previousValue: updateResult.previousValue,
      appliedDamage: effectiveAmount,
      newValue: updateResult.newValue,
      success: true,
    });
    updated.push({ targetUuid: target?.uuid ?? null, actorUuid: actor?.uuid ?? null, resourcePath, damageReduction, appliedDamage: effectiveAmount, previousValue: updateResult.previousValue, newValue: updateResult.newValue });
  }

  transaction.targets = transaction.targets.slice();
  const result = {
    success: Boolean(updated.length),
    transactionId: transaction.id,
    mode,
    damageType,
    baseDamage,
    appliedAmount: amount,
    targets: { updated, skipped, failed },
    summary: {
      requestedCount: eligibleTargets.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
    },
    issues: [],
  };

  if (result.success) {
    await recordDamageTransaction(message, transaction);
    Hooks.callAll("marvel-multiverse.damageApplied", message, transaction, result);
  }

  return result;
}

export function getDamageApplications(message) {
  return readDamageApplications(message);
}

export async function undoMessageDamage(message, options = {}) {
  const resolvedOptions = { force: false, quiet: false, ...options };
  const applications = readDamageApplications(message);
  const transaction = applications.slice().reverse().find((entry) => !entry.undone);
  if (!transaction) {
    return {
      success: false,
      issues: [createIssue("warning", "NO_TRANSACTION_TO_UNDO", "No damage transaction is available to undo.", { messageId: message?.id ?? null })],
      summary: { requestedCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0 },
      targets: { updated: [], skipped: [], failed: [] },
    };
  }

  const updated = [];
  const skipped = [];
  const failed = [];
  for (const target of transaction.targets ?? []) {
    const resolvedTarget = await resolveTargetActorEntry({ uuid: target.targetUuid }, { message });
    if (!resolvedTarget.success) {
      failed.push({ targetUuid: target.targetUuid, reason: resolvedTarget.reason });
      continue;
    }
    const actor = resolvedTarget.actor;
    if (!hasActorMutationPermission(actor) && !resolvedOptions.force) {
      skipped.push({ targetUuid: target.targetUuid, reason: "permission-denied" });
      continue;
    }
    const currentValue = getActorResource(actor, target.resourcePath);
    const shouldRestore = currentValue === target.newValue || resolvedOptions.force;
    if (!shouldRestore) {
      skipped.push({ targetUuid: target.targetUuid, reason: "resource-conflict" });
      continue;
    }
    const restoreAmount = Math.max(0, target.newValue - target.previousValue);
    const restoreData = buildUpdateData(target.resourcePath, target.previousValue);
    if (typeof actor.update === "function") {
      await actor.update(restoreData);
    } else if (typeof actor.parent?.update === "function") {
      await actor.parent.update(restoreData);
    }
    updated.push({ targetUuid: target.targetUuid, actorUuid: actor?.uuid ?? null, resourcePath: target.resourcePath, previousValue: target.previousValue, newValue: target.previousValue });
  }

  transaction.undone = true;
  transaction.undoneAt = Date.now();
  transaction.undoneBy = game.user?.id ?? null;
  await updateChatMessageFlags(message, { "marvel-multiverse": { damageApplications: applications } });
  const result = {
    success: Boolean(updated.length),
    transactionId: transaction.id,
    targets: { updated, skipped, failed },
    summary: { requestedCount: (transaction.targets ?? []).length, updatedCount: updated.length, skippedCount: skipped.length, failedCount: failed.length },
    issues: [],
  };
  Hooks.callAll("marvel-multiverse.damageUndone", message, transaction, result);
  return result;
}

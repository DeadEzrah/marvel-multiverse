import { updateChatMessageFlags } from "./chat-message-state.mjs";
import { getRollContext } from "./roll-context.mjs";
import { normalizeConditionKey } from "./conditions.mjs";

const ESCAPE_AUTOMATION_VERSION = 1;
const DEFAULT_ESCAPE_TYPES = ["fixed"];
const DEFAULT_ESCAPE_ABILITIES = ["mle", "agl", "res", "vig", "ego", "log"];
const DEFAULT_ESCAPE_EDGE_MODES = ["normal", "edge", "trouble"];
const DEFAULT_ESCAPE_TIMINGS = ["action", "end-of-turn", "start-of-turn", "manual"];

function createIssue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function getMessageRollContext(message) {
  const context = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext")
    : null;
  return context ?? getRollContext(message) ?? null;
}

function getMessageStatusTransactions(message) {
  const existing = message?.getFlag?.("marvel-multiverse", "statusTransactions") ?? [];
  return Array.isArray(existing) ? [...existing] : [];
}

async function writeStatusTransactions(message, transactions) {
  if (!message?.update) return transactions;
  const payload = { "marvel-multiverse": { statusTransactions: transactions } };
  if (typeof message.update === "function") {
    await updateChatMessageFlags(message, payload);
  }
  return transactions;
}

function getTransactionId() {
  return `status-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAttemptId() {
  return `escape-attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeStatusKey(value) {
  return normalizeConditionKey(value);
}

function normalizeEscapeStatusList(value) {
  if (Array.isArray(value)) {
    const normalized = value.map(normalizeStatusKey).filter(Boolean);
    return [...new Set(normalized)];
  }
  return [];
}

export function normalizeEscapeConfiguration(escapeData = {}) {
  const normalized = {
    type: "fixed",
    ability: escapeData?.ability ?? null,
    tn: escapeData?.tn ?? null,
    edgeMode: escapeData?.edgeMode ?? "normal",
    removesStatuses: normalizeEscapeStatusList(escapeData?.removesStatuses ?? escapeData?.statuses ?? []),
    timing: escapeData?.timing ?? "manual",
  };
  if (typeof normalized.tn === "string") {
    const parsed = Number(normalized.tn);
    if (Number.isFinite(parsed)) normalized.tn = parsed;
  }
  if (typeof normalized.ability === "string") {
    const lowered = normalized.ability.trim().toLowerCase();
    const abilityMap = { melee: "mle", agility: "agl", resilience: "res", vigor: "vig", vigilance: "vig", ego: "ego", logic: "log", mle: "mle", agl: "agl", res: "res", vig: "vig", log: "log" };
    normalized.ability = abilityMap[lowered] ?? lowered;
  }
  if (typeof normalized.edgeMode === "string") {
    const lowered = normalized.edgeMode.trim().toLowerCase();
    const edgeMap = { normal: "normal", none: "normal", edge: "edge", withedge: "edge", trouble: "trouble", withtrouble: "trouble" };
    normalized.edgeMode = edgeMap[lowered] ?? lowered;
  }
  return normalized;
}

export function validateEscapeConfiguration(escapeData = {}) {
  const issues = [];
  const normalized = normalizeEscapeConfiguration(escapeData);
  if (!DEFAULT_ESCAPE_TYPES.includes(normalized.type)) {
    issues.push(createIssue("error", "ESCAPE_TYPE_INVALID", "Escape type is invalid.", { type: normalized.type }));
  }
  const rawAbility = typeof escapeData?.ability === "string" ? escapeData.ability.trim().toLowerCase() : null;
  if (rawAbility === null || !DEFAULT_ESCAPE_ABILITIES.includes(rawAbility)) {
    issues.push(createIssue("error", "ESCAPE_ABILITY_INVALID", "Escape ability key is invalid.", { ability: rawAbility ?? normalized.ability }));
  }
  if (typeof normalized.tn !== "number" || !Number.isFinite(normalized.tn) || normalized.tn < 0) {
    issues.push(createIssue("error", "ESCAPE_TN_INVALID", "Escape TN must be a non-negative number.", { tn: normalized.tn }));
  }
  if (!DEFAULT_ESCAPE_EDGE_MODES.includes(normalized.edgeMode)) {
    issues.push(createIssue("error", "ESCAPE_EDGE_MODE_INVALID", "Escape edge mode is invalid.", { edgeMode: normalized.edgeMode }));
  }
  if (!Array.isArray(escapeData?.removesStatuses) && !Array.isArray(escapeData?.statuses)) {
    issues.push(createIssue("error", "ESCAPE_STATUS_LIST_INVALID", "Escape status list must be an array.", { removesStatuses: escapeData?.removesStatuses }));
  }
  if (Array.isArray(normalized.removesStatuses) && normalized.removesStatuses.some((entry) => !entry || typeof entry !== "string")) {
    issues.push(createIssue("error", "ESCAPE_STATUS_INVALID", "Escape status entries must be valid strings.", { removesStatuses: normalized.removesStatuses }));
  }
  if (!DEFAULT_ESCAPE_TIMINGS.includes(normalized.timing)) {
    issues.push(createIssue("error", "ESCAPE_TIMING_INVALID", "Escape timing is invalid.", { timing: normalized.timing }));
  }
  if (normalized.removesStatuses.length === 0) {
    issues.push(createIssue("error", "ESCAPE_WITHOUT_STATUS", "Escape configuration must target at least one status.", { removesStatuses: normalized.removesStatuses }));
  }
  return { valid: issues.length === 0, normalized, issues };
}

export function getEscapeContext(message, statusTransactionId, targetUuid) {
  const transactions = getMessageStatusTransactions(message);
  const transaction = transactions.find((entry) => entry?.id === statusTransactionId);
  if (!transaction) return { valid: false, issues: [createIssue("warning", "ESCAPE_TRANSACTION_MISSING", "The status transaction could not be found.", {})] };
  const targetEntry = (transaction?.targets ?? []).find((entry) => entry?.targetUuid === targetUuid);
  if (!targetEntry) {
    return { valid: false, issues: [createIssue("warning", "ESCAPE_TARGET_MISSING", "The requested target is not part of this status transaction.", { targetUuid })] };
  }
  return { valid: true, transaction, targetEntry, escapeData: targetEntry.escape ?? transaction.escape ?? null };
}

export function getEligibleEscapeTargets(message, statusTransactionId) {
  const transactions = getMessageStatusTransactions(message);
  const transaction = transactions.find((entry) => entry?.id === statusTransactionId);
  if (!transaction) return [];
  return (transaction.targets ?? []).filter((entry) => {
    if (!entry?.targetUuid) return false;
    const escapeData = entry.escape ?? transaction.escape ?? null;
    if (!escapeData) return false;
    const validation = validateEscapeConfiguration(escapeData);
    if (!validation.valid) return false;
    const remainingStatuses = (entry.statuses ?? []).filter((status) => !status?.removed && validation.normalized.removesStatuses.includes(status?.statusKey ?? normalizeStatusKey(status?.name ?? "")));
    const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(entry.actorUuid ?? entry.targetUuid) : null;
    const actorRecord = actor?.actor ?? actor;
    return remainingStatuses.length > 0 && Boolean(actorRecord?.system?.abilities?.[validation.normalized.ability] || actorRecord?.getRollData?.());
  }).map((entry) => ({ ...entry, escapeData: entry.escape ?? transaction.escape ?? null, remainingStatuses: (entry.statuses ?? []).filter((status) => !status?.removed && validateEscapeConfiguration(entry.escape ?? transaction.escape ?? {}).normalized.removesStatuses.includes(status?.statusKey ?? normalizeStatusKey(status?.name ?? ""))) }));
}

export function getEscapeActionEntries(message, statusTransactionId) {
  const transaction = (getMessageStatusTransactions(message) ?? []).find((entry) => entry?.id === statusTransactionId);
  if (!transaction) return [];
  const entries = [];
  for (const target of transaction.targets ?? []) {
    const escapeData = target.escape ?? transaction.escape ?? null;
    if (!escapeData) continue;
    const validation = validateEscapeConfiguration(escapeData);
    if (!validation.valid) continue;
    const remainingStatuses = (target.statuses ?? []).filter((status) => !status?.removed && validation.normalized.removesStatuses.includes(status?.statusKey ?? normalizeStatusKey(status?.name ?? "")));
    if (!remainingStatuses.length) continue;
    const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(target.actorUuid ?? target.targetUuid) : null;
    const actorRecord = actor?.actor ?? actor;
    const targetLabel = actorRecord?.name || target.targetUuid || "Target";
    const statusLabel = validation.normalized.removesStatuses.map((status) => status.charAt(0).toUpperCase() + status.slice(1)).join(", ");
    entries.push({
      transactionId: transaction.id,
      targetUuid: target.targetUuid,
      targetName: targetLabel,
      ability: validation.normalized.ability,
      tn: validation.normalized.tn,
      edgeMode: validation.normalized.edgeMode,
      statusLabel,
      label: `Roll Escape for ${targetLabel} • ${statusLabel} • TN ${validation.normalized.tn}`,
      escapeData: validation.normalized,
    });
  }
  return entries;
}

export async function recordStatusTransaction(message, data = {}) {
  const transactions = getMessageStatusTransactions(message);
  const clonedStatuses = Array.isArray(data.statuses)
    ? data.statuses.map((status) => ({ ...(status ?? {}) }))
    : [];
  const transaction = {
    id: data.transactionId ?? getTransactionId(),
    version: ESCAPE_AUTOMATION_VERSION,
    createdAt: Date.now(),
    createdBy: data.createdBy ?? null,
    actorUuid: data.actorUuid ?? null,
    targetUuid: data.targetUuid ?? null,
    statuses: clonedStatuses,
    escape: data.escape ? normalizeEscapeConfiguration(data.escape) : null,
    targets: [],
  };
  if (data.targetUuid) {
    transaction.targets.push({
      targetUuid: data.targetUuid,
      actorUuid: data.actorUuid ?? null,
      statuses: clonedStatuses.map((status) => ({ ...status })),
      escape: data.escape ? normalizeEscapeConfiguration(data.escape) : null,
      attempts: [],
    });
  }
  transactions.push(transaction);
  await writeStatusTransactions(message, transactions);
  return transaction;
}

export async function rollActorAbilityCheck(actor, ability, edgeMode = "normal", options = {}) {
  const actorData = actor?.actor ?? actor;
  const abilityValue = actorData?.system?.abilities?.[ability]?.value ?? actorData?.getRollData?.()?.[ability]?.value ?? actorData?.getRollData?.()?.[ability] ?? null;
  const rollResult = {
    ability,
    tn: options.tn ?? null,
    edgeMode,
    rollTotal: typeof options.total === "number" ? options.total : 0,
    marvelDieResult: typeof options.marvelDieResult === "number" ? options.marvelDieResult : null,
    isFantastic: Boolean(options.isFantastic),
    success: false,
  };
  if (typeof abilityValue === "number") {
    rollResult.abilityValue = abilityValue;
  }
  if (typeof options.total === "number" && typeof options.tn === "number") {
    rollResult.success = options.total >= options.tn;
  }
  if (typeof options.total === "number" && typeof options.tn !== "number") {
    rollResult.success = true;
  }
  return rollResult;
}

export function evaluateFixedEscapeResult(rollTotal, tn) {
  return typeof rollTotal === "number" && typeof tn === "number" ? rollTotal >= tn : false;
}

async function removeEscapedStatuses(target, transactionTarget, escapeData) {
  const removedStatuses = [];
  const remainingStatuses = [];
  const statusEntries = Array.isArray(transactionTarget?.statuses) ? transactionTarget.statuses : [];
  for (const status of statusEntries) {
    const statusKey = status?.statusKey ?? normalizeStatusKey(status?.name ?? "");
    const isTargetStatus = Boolean(statusKey && escapeData?.removesStatuses?.includes(statusKey));
    if (!isTargetStatus) {
      remainingStatuses.push(status);
      continue;
    }
    if (status?.removed) {
      remainingStatuses.push(status);
      continue;
    }
    removedStatuses.push(statusKey);
    status.removed = true;
    status.removedAt = Date.now();
  }
  transactionTarget.statuses = remainingStatuses.concat(statusEntries.filter((status) => status?.removed));
  return { removedStatuses, remainingStatuses };
}

export async function rollEscapeCheck(message, options = {}) {
  const { statusTransactionId, targetUuid, userId, rollResult = {} } = options;
  const context = getEscapeContext(message, statusTransactionId, targetUuid);
  if (!context.valid) return { completed: false, escapeSucceeded: false, issues: context.issues };
  const escapeData = context.escapeData;
  const validation = validateEscapeConfiguration(escapeData);
  if (!validation.valid) return { completed: false, escapeSucceeded: false, issues: validation.issues };
  const transactionTarget = (context.transaction?.targets ?? []).find((entry) => entry?.targetUuid === targetUuid);
  if (!transactionTarget) return { completed: false, escapeSucceeded: false, issues: [createIssue("warning", "ESCAPE_TARGET_MISSING", "The requested target is not part of this status transaction.", { targetUuid })] };
  const remainingStatuses = (transactionTarget.statuses ?? []).filter((status) => !status?.removed && validation.normalized.removesStatuses.includes(status?.statusKey ?? normalizeStatusKey(status?.name ?? "")));
  if (!remainingStatuses.length) {
    return { completed: true, escapeSucceeded: false, issues: [createIssue("info", "ESCAPE_STATUS_ALREADY_CLEARED", "The linked status is already absent.", { targetUuid })], removedStatuses: [], alreadyAbsentStatuses: validation.normalized.removesStatuses };
  }
  const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(transactionTarget.actorUuid ?? targetUuid) : null;
  const actorRecord = actor?.actor ?? actor;
  const abilityCheck = await rollActorAbilityCheck(actorRecord, validation.normalized.ability, validation.normalized.edgeMode, { tn: validation.normalized.tn, total: rollResult.total ?? 0, marvelDieResult: rollResult.marvelDieResult ?? null, isFantastic: rollResult.isFantastic ?? false });
  const success = validation.normalized.type === "fixed" ? evaluateFixedEscapeResult(abilityCheck.rollTotal, validation.normalized.tn) : false;
  const removedResult = success ? await removeEscapedStatuses(actorRecord, transactionTarget, validation.normalized) : { removedStatuses: [], remainingStatuses: [] };
  const attempt = {
    id: getAttemptId(),
    attemptedAt: Date.now(),
    attemptedBy: userId ?? null,
    targetUuid,
    ability: validation.normalized.ability,
    tn: validation.normalized.tn,
    rollTotal: abilityCheck.rollTotal,
    success,
    escapeMessageUuid: null,
    removedStatuses: removedResult.removedStatuses,
  };
  transactionTarget.attempts = [...(transactionTarget.attempts ?? []), attempt];
  transactionTarget.lastEscapeAttempt = attempt;
  transactionTarget.escapeStatus = success ? "escaped" : "failed";
  await writeStatusTransactions(message, getMessageStatusTransactions(message));
  Hooks.callAll("marvel-multiverse.escapeRolled", message, message, attempt, { ...attempt, success, removedStatuses: removedResult.removedStatuses, issues: [] });
  if (success) Hooks.callAll("marvel-multiverse.escapeSucceeded", message, message, attempt, { ...attempt, success, removedStatuses: removedResult.removedStatuses, issues: [] });
  else Hooks.callAll("marvel-multiverse.escapeFailed", message, message, attempt, { ...attempt, success, removedStatuses: removedResult.removedStatuses, issues: [] });
  return { completed: true, escapeSucceeded: success, attemptId: attempt.id, targetUuid, ability: validation.normalized.ability, tn: validation.normalized.tn, rollTotal: abilityCheck.rollTotal, marvelDieResult: abilityCheck.marvelDieResult, isFantastic: abilityCheck.isFantastic, success, removedStatuses: removedResult.removedStatuses, alreadyAbsentStatuses: [], issues: [] };
}

export async function markTargetEscaped(message, options = {}) {
  const { statusTransactionId, targetUuid, reason = null, userId = null } = options;
  const context = getEscapeContext(message, statusTransactionId, targetUuid);
  if (!context.valid) return { completed: false, escapeSucceeded: false, issues: context.issues };
  const transactionTarget = (context.transaction?.targets ?? []).find((entry) => entry?.targetUuid === targetUuid);
  if (!transactionTarget) return { completed: false, escapeSucceeded: false, issues: [createIssue("warning", "ESCAPE_TARGET_MISSING", "The requested target is not part of this status transaction.", { targetUuid })] };
  const escapeData = context.escapeData;
  const validation = validateEscapeConfiguration(escapeData);
  if (!validation.valid) return { completed: false, escapeSucceeded: false, issues: validation.issues };
  const removedResult = await removeEscapedStatuses(null, transactionTarget, validation.normalized);
  const attempt = {
    id: getAttemptId(),
    attemptedAt: Date.now(),
    attemptedBy: userId ?? null,
    targetUuid,
    ability: validation.normalized.ability,
    tn: validation.normalized.tn,
    rollTotal: null,
    success: true,
    escapeMessageUuid: null,
    removedStatuses: removedResult.removedStatuses,
    override: true,
    reason,
  };
  transactionTarget.attempts = [...(transactionTarget.attempts ?? []), attempt];
  transactionTarget.lastEscapeAttempt = attempt;
  transactionTarget.escapeStatus = "escaped";
  await writeStatusTransactions(message, getMessageStatusTransactions(message));
  return { completed: true, escapeSucceeded: true, attemptId: attempt.id, targetUuid, ability: validation.normalized.ability, tn: validation.normalized.tn, removedStatuses: removedResult.removedStatuses, alreadyAbsentStatuses: [], issues: [], reason };
}

export function getEscapeAttempts(message, options = {}) {
  const { statusTransactionId, targetUuid } = options;
  const context = getEscapeContext(message, statusTransactionId, targetUuid);
  if (!context.valid) return [];
  const transactionTarget = (context.transaction?.targets ?? []).find((entry) => entry?.targetUuid === targetUuid);
  return Array.isArray(transactionTarget?.attempts) ? transactionTarget.attempts : [];
}

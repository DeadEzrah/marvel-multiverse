import { updateChatMessageFlags } from "./chat-message-state.mjs";
import { getRollContext } from "./roll-context.mjs";
import { hasActorMutationPermission } from "./services/mutation-preflight.mjs";

const FOCUS_AUTOMATION_VERSION = 1;

function createIssue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function getMessageRollContext(message) {
  const context = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext")
    : null;
  return context ?? getRollContext(message) ?? null;
}

export function parseFocusCost(costText) {
  if (costText === undefined || costText === null || costText === "") return { valid: false, type: "unknown", originalText: costText ?? "", confidence: "none", issues: [] };
  if (typeof costText === "number" && Number.isFinite(costText)) {
    return { valid: true, type: "fixed", value: costText, originalText: String(costText), confidence: "high" };
  }
  if (typeof costText !== "string") return { valid: false, type: "unknown", originalText: String(costText ?? ""), confidence: "none", issues: [] };
  const normalized = costText.trim().toLowerCase();
  if (!normalized || ["none", "—"].includes(normalized)) return { valid: false, type: "unknown", originalText: costText, confidence: "none", issues: [] };
  const plainNumberMatch = normalized.match(/^(?<value>\d+)$/);
  if (plainNumberMatch?.groups?.value) {
    return { valid: true, type: "fixed", value: Number(plainNumberMatch.groups.value), originalText: costText, confidence: "high" };
  }
  const fixedPlusOnlyMatch = normalized.match(/^(?<minimum>\d+)\+$/);
  if (fixedPlusOnlyMatch?.groups?.minimum) {
    return { valid: true, type: "variable", minimum: Number(fixedPlusOnlyMatch.groups.minimum), maximum: null, originalText: costText, confidence: "high" };
  }
  const variableWordsOnlyMatch = normalized.match(/^(?<minimum>\d+)\s+or\s+more$/);
  if (variableWordsOnlyMatch?.groups?.minimum) {
    return { valid: true, type: "variable", minimum: Number(variableWordsOnlyMatch.groups.minimum), maximum: null, originalText: costText, confidence: "high" };
  }
  const fixedMatch = normalized.match(/^(?<value>\d+)\s+focus$/);
  if (fixedMatch?.groups?.value) {
    return { valid: true, type: "fixed", value: Number(fixedMatch.groups.value), originalText: costText, confidence: "high" };
  }
  const variableMatch = normalized.match(/^(?<minimum>\d+)\s+or\s+more\s+focus$/);
  if (variableMatch?.groups?.minimum) {
    return { valid: true, type: "variable", minimum: Number(variableMatch.groups.minimum), maximum: null, originalText: costText, confidence: "high" };
  }
  const variableReverseMatch = normalized.match(/^(?<minimum>\d+)\s+focus\s+or\s+more$/);
  if (variableReverseMatch?.groups?.minimum) {
    return { valid: true, type: "variable", minimum: Number(variableReverseMatch.groups.minimum), maximum: null, originalText: costText, confidence: "high" };
  }
  const plusMatch = normalized.match(/^(?<minimum>\d+)\s*\+\s*focus$/);
  if (plusMatch?.groups?.minimum) {
    return { valid: true, type: "variable", minimum: Number(plusMatch.groups.minimum), maximum: null, originalText: costText, confidence: "high" };
  }
  const minimumMatch = normalized.match(/^minimum\s+(?<minimum>\d+)\s+focus$/);
  if (minimumMatch?.groups?.minimum) {
    return { valid: true, type: "variable", minimum: Number(minimumMatch.groups.minimum), maximum: null, originalText: costText, confidence: "high" };
  }
  return { valid: false, type: "unknown", originalText: costText, confidence: "none", issues: [] };
}

function getActorResource(actor, resourcePath) {
  if (!actor || typeof actor !== "object") return null;
  const value = globalThis.foundry?.utils?.getProperty?.(actor, resourcePath);
  return typeof value === "number" ? value : actor?.system?.focus?.value ?? null;
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

function getMessageFocusTransactions(message) {
  const existing = message?.getFlag?.("marvel-multiverse", "focusTransactions") ?? [];
  return Array.isArray(existing) ? [...existing] : [];
}

async function writeFocusTransactions(message, transactions) {
  await updateChatMessageFlags(message, { "marvel-multiverse": { focusTransactions: transactions } });
}

function getTransactionId() {
  return `focus-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFocusCostContext(message) {
  const rollContext = getMessageRollContext(message);
  const sourceCost = rollContext?.focusCost ?? null;
  if (sourceCost && typeof sourceCost === "object") {
    if (sourceCost.type === "fixed" && typeof sourceCost.value === "number") {
      return { valid: true, type: "fixed", value: sourceCost.value, originalText: sourceCost.originalText ?? null, confidence: sourceCost.confidence ?? "high" };
    }
    if (sourceCost.type === "variable") {
      return {
        valid: true,
        type: "variable",
        minimum: typeof sourceCost.minimum === "number" ? sourceCost.minimum : 0,
        maximum: typeof sourceCost.maximum === "number" ? sourceCost.maximum : null,
        originalText: sourceCost.originalText ?? null,
        confidence: sourceCost.confidence ?? "high",
      };
    }
    if (sourceCost.type === "choice") {
      return { valid: true, type: "choice", options: Array.isArray(sourceCost.options) ? sourceCost.options : [], selected: sourceCost.selected ?? null, originalText: sourceCost.originalText ?? null, confidence: sourceCost.confidence ?? "high" };
    }
    if (sourceCost.valid === true) return sourceCost;
  }
  const item = message?.flags?.["marvel-multiverse"]?.item ?? null;
  const itemCost = item?.system?.cost ?? item?.system?.focusCost ?? null;
  if (itemCost !== undefined && itemCost !== null && itemCost !== "") {
    const parsed = parseFocusCost(itemCost);
    if (parsed?.valid) return parsed;
  }
  const rollCostText = rollContext?.source?.costText ?? null;
  if (rollCostText !== undefined && rollCostText !== null && rollCostText !== "") {
    const parsed = parseFocusCost(rollCostText);
    if (parsed?.valid) return parsed;
  }
  return null;
}

function resolveFocusActor(message, options = {}) {
  const rollContext = getMessageRollContext(message);
  const actorUuid = rollContext?.actorUuid ?? null;
  const tokenUuid = rollContext?.tokenUuid ?? null;
  if (typeof actorUuid === "string" && actorUuid.trim()) {
    const resolved = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(actorUuid) : null;
    if (resolved) return { actor: resolved, token: null, actorUuid, tokenUuid };
  }
  if (typeof tokenUuid === "string" && tokenUuid.trim()) {
    const resolved = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(tokenUuid) : null;
    if (resolved?.actor) return { actor: resolved.actor, token: resolved, actorUuid, tokenUuid };
  }
  const storedActor = message?.flags?.["marvel-multiverse"]?.actor ?? null;
  if (storedActor) return { actor: storedActor, token: null, actorUuid: storedActor.uuid ?? null, tokenUuid };
  return { actor: null, token: null, actorUuid, tokenUuid };
}

function validateFocusAmount(actor, costContext, amount, options = {}) {
  if (!actor || typeof actor !== "object") {
    return { success: false, issues: [createIssue("error", "ACTOR_MISSING", "The acting actor could not be resolved.", {})] };
  }
  const currentFocus = getActorResource(actor, "system.focus.value");
  if (typeof currentFocus !== "number" || !Number.isFinite(currentFocus)) {
    return { success: false, issues: [createIssue("error", "FOCUS_VALUE_INVALID", "The actor does not have a usable Focus value.", {})] };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    return { success: false, issues: [createIssue("error", "INVALID_FOCUS_AMOUNT", "The requested Focus amount is invalid.", {})] };
  }
  if (costContext?.type === "fixed") {
    if (typeof costContext.value !== "number" || !Number.isInteger(costContext.value) || costContext.value < 0) {
      return { success: false, issues: [createIssue("error", "FOCUS_COST_INVALID", "The Focus cost is invalid.", {})] };
    }
    const requested = costContext.value;
    if (requested > currentFocus) {
      return { success: false, issues: [createIssue("error", "INSUFFICIENT_FOCUS", `The actor does not have enough Focus.`, { requestedAmount: requested, availableAmount: currentFocus })] };
    }
    if (requested > 0 && requested > (actor.system?.focus?.max ?? Infinity)) {
      return { success: false, issues: [createIssue("error", "FOCUS_COST_EXCEEDS_MAX", "The requested Focus cost exceeds the maximum allowed value.", {})] };
    }
    return { success: true, requestedAmount: requested, availableAmount: currentFocus };
  }
  if (costContext?.type === "variable") {
    const minimum = typeof costContext.minimum === "number" ? costContext.minimum : 0;
    const maximum = typeof costContext.maximum === "number" ? costContext.maximum : null;
    if (amount < minimum) {
      return { success: false, issues: [createIssue("error", "FOCUS_COST_BELOW_MINIMUM", "The requested amount is below the minimum Focus cost.", {})] };
    }
    if (maximum !== null && amount > maximum) {
      return { success: false, issues: [createIssue("error", "FOCUS_COST_ABOVE_MAXIMUM", "The requested amount exceeds the maximum Focus cost.", {})] };
    }
    if (amount > currentFocus) {
      return { success: false, issues: [createIssue("error", "INSUFFICIENT_FOCUS", `The actor does not have enough Focus.`, { requestedAmount: amount, availableAmount: currentFocus })] };
    }
    return { success: true, requestedAmount: amount, availableAmount: currentFocus };
  }
  return { success: false, issues: [createIssue("warning", "FOCUS_COST_NONE", "This power does not have a structured Focus cost.", {})] };
}

async function applyFocusSpend(actor, amount) {
  const currentFocus = getActorResource(actor, "system.focus.value");
  if (typeof currentFocus !== "number" || !Number.isFinite(currentFocus)) return { success: false, issues: [createIssue("error", "FOCUS_VALUE_INVALID", "The actor does not have a usable Focus value.", {})] };
  const nextValue = Math.max(0, currentFocus - amount);
  const updateData = buildUpdateData("system.focus.value", nextValue);
  if (typeof actor.update === "function") {
    await actor.update(updateData);
    return { success: true, previousValue: currentFocus, newValue: nextValue };
  }
  return { success: false, issues: [createIssue("error", "ACTOR_UPDATE_UNAVAILABLE", "The actor could not be updated.", {})] };
}

async function recordFocusTransaction(message, transaction) {
  const transactions = getMessageFocusTransactions(message);
  transactions.push(transaction);
  await writeFocusTransactions(message, transactions);
  return transaction;
}

export async function spendActorFocus(actor, amount) {
  if (!hasActorMutationPermission(actor)) {
    return { success: false, issues: [createIssue("error", "PERMISSION_DENIED", "You do not have permission to spend Focus.")] };
  }
  const validation = validateFocusAmount(actor, { type: "fixed", value: amount }, amount);
  if (!validation.success) return validation;
  return applyFocusSpend(actor, validation.requestedAmount);
}

export async function spendMessageFocus(message, options = {}) {
  const resolvedOptions = { amount: null, quiet: false, costType: "fixed", custom: false, ...options };
  const resolvedActor = resolveFocusActor(message);
  if (!resolvedActor.actor) {
    return { success: false, actorUuid: resolvedActor.actorUuid, issues: [createIssue("error", "ACTOR_MISSING", "The acting actor could not be resolved.", {})] };
  }
  const actor = resolvedActor.actor;
  const canSpend = hasActorMutationPermission(actor);
  if (!canSpend) {
    return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("error", "PERMISSION_DENIED", "You do not have permission to spend Focus.", {})] };
  }
  const costContext = getFocusCostContext(message);
  if (!costContext || !costContext.valid) {
    return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("warning", "FOCUS_COST_UNRESOLVED", "This power does not have a structured Focus cost.", {})] };
  }
  const amount = resolvedOptions.amount ?? (costContext.type === "fixed" ? costContext.value : null);
  const validation = validateFocusAmount(actor, costContext, amount, { message });
  if (!validation.success) {
    return { success: false, actorUuid: actor.uuid ?? null, requestedAmount: amount, issues: validation.issues };
  }
  const applyResult = await applyFocusSpend(actor, validation.requestedAmount);
  if (!applyResult.success) return { success: false, actorUuid: actor.uuid ?? null, requestedAmount: validation.requestedAmount, issues: applyResult.issues };
  const transaction = {
    id: getTransactionId(),
    version: FOCUS_AUTOMATION_VERSION,
    createdAt: Date.now(),
    createdBy: game.user?.id ?? null,
    actorUuid: actor.uuid ?? null,
    tokenUuid: resolvedActor.tokenUuid ?? null,
    itemUuid: getMessageRollContext(message)?.itemUuid ?? null,
    type: "spend",
    costType: resolvedOptions.custom ? "custom" : costContext.type,
    requestedAmount: validation.requestedAmount,
    appliedAmount: validation.requestedAmount,
    previousValue: applyResult.previousValue,
    newValue: applyResult.newValue,
    refunded: false,
  };
  await recordFocusTransaction(message, transaction);
  Hooks.callAll("marvel-multiverse.focusSpent", message, transaction, { success: true, ...transaction, issues: [] });
  return { success: true, transactionId: transaction.id, actorUuid: actor.uuid ?? null, costType: transaction.costType, requestedAmount: validation.requestedAmount, appliedAmount: validation.requestedAmount, previousValue: applyResult.previousValue, newValue: applyResult.newValue, issues: [] };
}

export async function refundMessageFocus(message, options = {}) {
  const resolvedOptions = { quiet: false, force: false, ...options };
  const resolvedActor = resolveFocusActor(message);
  if (!resolvedActor.actor) {
    return { success: false, actorUuid: resolvedActor.actorUuid, issues: [createIssue("error", "ACTOR_MISSING", "The acting actor could not be resolved.", {})] };
  }
  const actor = resolvedActor.actor;
  const canSpend = hasActorMutationPermission(actor);
  if (!canSpend) {
    return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("error", "PERMISSION_DENIED", "You do not have permission to refund Focus.", {})] };
  }
  const transactions = getMessageFocusTransactions(message);
  const transaction = [...transactions].reverse().find((entry) => entry?.type === "spend" && !entry?.refunded);
  const actionFocus = message?.getFlag?.("marvel-multiverse", "actionFocus") ?? null;
  if (!transaction && actionFocus && actionFocus.refunded !== true) {
    const currentFocus = getActorResource(actor, "system.focus.value");
    const amount = Number(actionFocus.amount);
    const previousValue = Number(actionFocus.previousValue);
    const spentValue = Number(actionFocus.newValue);
    if (![currentFocus, amount, previousValue, spentValue].every(Number.isFinite)) {
      return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("error", "FOCUS_TRANSACTION_INVALID", "The original Focus spend could not be restored.", {})] };
    }
    const shouldRestore = currentFocus === spentValue || resolvedOptions.force;
    if (!shouldRestore && !resolvedOptions.force) {
      return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("warning", "FOCUS_CONFLICT", "Focus changed after the original spend. Add back the spent amount instead?", { refundMode: "add-back" })] };
    }
    const maxFocus = actor.system?.focus?.max ?? Infinity;
    const restoreValue = shouldRestore ? previousValue : Math.min(maxFocus, currentFocus + amount);
    const nextValue = Math.max(0, Math.min(maxFocus, restoreValue));
    await actor.update({ "system.focus.value": nextValue });
    await updateChatMessageFlags(message, {
      "marvel-multiverse": {
        actionFocus: {
          ...actionFocus,
          refunded: true,
          refundedAt: Date.now(),
          refundedBy: game.user?.id ?? null,
          refundMode: shouldRestore ? "restore" : "add-back",
        },
      },
    });
    return { success: true, actorUuid: actor.uuid ?? null, requestedAmount: amount, previousValue: currentFocus, newValue: nextValue, issues: [] };
  }
  if (!transaction) {
    return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("warning", "NO_REFUNDABLE_TRANSACTION", "No refundable Focus transaction is available.", {})] };
  }
  const currentFocus = getActorResource(actor, "system.focus.value");
  const maxFocus = actor.system?.focus?.max ?? Infinity;
  if (typeof currentFocus !== "number" || !Number.isFinite(currentFocus)) {
    return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("error", "FOCUS_VALUE_INVALID", "The actor does not have a usable Focus value.", {})] };
  }
  const shouldRestore = currentFocus === transaction.newValue || resolvedOptions.force;
  const restoreValue = shouldRestore ? transaction.previousValue : Math.min(maxFocus, currentFocus + transaction.appliedAmount);
  if (!shouldRestore && !resolvedOptions.force) {
    return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("warning", "FOCUS_CONFLICT", "Focus changed after the original spend. Add back the spent amount instead?", { refundMode: "add-back" })] };
  }
  const updateData = buildUpdateData("system.focus.value", Math.max(0, Math.min(maxFocus, restoreValue)));
  if (typeof actor.update === "function") {
    await actor.update(updateData);
  } else {
    return { success: false, actorUuid: actor.uuid ?? null, issues: [createIssue("error", "ACTOR_UPDATE_UNAVAILABLE", "The actor could not be updated.", {})] };
  }
  transaction.refunded = true;
  transaction.refundedAt = Date.now();
  transaction.refundedBy = game.user?.id ?? null;
  transaction.refundMode = shouldRestore ? "restore" : "add-back";
  await writeFocusTransactions(message, transactions);
  Hooks.callAll("marvel-multiverse.focusRefunded", message, transaction, { success: true, ...transaction, issues: [] });
  return { success: true, transactionId: transaction.id, actorUuid: actor.uuid ?? null, requestedAmount: transaction.appliedAmount, previousValue: currentFocus, newValue: Math.max(0, Math.min(maxFocus, restoreValue)), issues: [] };
}

export function getFocusTransactions(message) {
  return getMessageFocusTransactions(message);
}

import { updateChatMessageFlags } from "./chat-message-state.mjs";
import { getRollContext } from "./roll-context.mjs";

const DAMAGE_CONTEXT_VERSION = 1;

function createIssue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function normalizeNumericInput(value, { allowZero = true, requireInteger = false, fieldName = "value" } = {}) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { valid: false, value: null, issue: createIssue("warning", "INVALID_NUMERIC_VALUE", `${fieldName} must be a finite number.`, { fieldName }) };
    if (requireInteger && !Number.isInteger(value)) return { valid: false, value: null, issue: createIssue("warning", "INVALID_INTEGER_VALUE", `${fieldName} must be an integer.`, { fieldName }) };
    return { valid: true, value };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { valid: false, value: null, issue: createIssue("warning", "INVALID_NUMERIC_VALUE", `${fieldName} must not be empty.`, { fieldName }) };
    if (!/^[-+]?\d+(?:\.\d+)?$/.test(trimmed)) return { valid: false, value: null, issue: createIssue("warning", "INVALID_NUMERIC_VALUE", `${fieldName} must be a numeric string.`, { fieldName }) };
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return { valid: false, value: null, issue: createIssue("warning", "INVALID_NUMERIC_VALUE", `${fieldName} must be a finite number.`, { fieldName }) };
    if (requireInteger && !Number.isInteger(parsed)) return { valid: false, value: null, issue: createIssue("warning", "INVALID_INTEGER_VALUE", `${fieldName} must be an integer.`, { fieldName }) };
    return { valid: true, value: parsed };
  }
  return { valid: false, value: null, issue: createIssue("warning", "INVALID_NUMERIC_VALUE", `${fieldName} must be a number or numeric string.`, { fieldName }) };
}

function normalizeDamageType(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized === "health" || normalized === "focus" ? normalized : null;
}

function normalizeAbilityKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ["mle", "agl", "res", "vig", "ego", "log"].includes(normalized) ? normalized : null;
}

function normalizeElement(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ["air", "cold", "earth", "electricity", "energy", "fire", "force", "hellfire", "ice", "iron", "light", "sound", "water", "toxin", "chemical", "swarm"].includes(normalized) ? normalized : null;
}

function normalizeBoolean(value) {
  return typeof value === "boolean" ? value : false;
}

export function calculateMarvelDamage({ marvelDie, damageMultiplier, abilityValue, damageReduction, isFantastic, options = {} } = {}) {
  const issues = [];
  const result = {
    raw: {
      marvelDie: marvelDie ?? null,
      damageMultiplier: damageMultiplier ?? null,
      abilityValue: abilityValue ?? null,
      damageReduction: damageReduction ?? null,
      isFantastic: Boolean(isFantastic),
    },
    normalized: {
      effectiveMultiplier: null,
      damageType: normalizeDamageType(options.damageType) ?? null,
      element: normalizeElement(options.element) ?? null,
    },
    calculation: {
      dieContribution: null,
      abilityContribution: null,
      subtotal: null,
      fantasticMultiplier: 1,
      finalDamage: null,
    },
    issues,
    valid: false,
  };

  const dieResult = normalizeNumericInput(marvelDie, { requireInteger: true, fieldName: "marvelDie" });
  if (!dieResult.valid) {
    issues.push(dieResult.issue);
  } else if (dieResult.value < 1 || dieResult.value > 6) {
    issues.push(createIssue("warning", "MARVEL_DIE_INVALID", "Marvel die must be between 1 and 6.", { fieldName: "marvelDie" }));
  }

  const multiplierResult = normalizeNumericInput(damageMultiplier, { requireInteger: true, fieldName: "damageMultiplier" });
  if (!multiplierResult.valid) {
    issues.push(multiplierResult.issue);
  }

  const abilityResult = normalizeNumericInput(abilityValue, { requireInteger: true, fieldName: "abilityValue" });
  if (!abilityResult.valid) {
    issues.push(abilityResult.issue);
  }

  const reductionResult = normalizeNumericInput(damageReduction, { requireInteger: true, fieldName: "damageReduction" });
  if (!reductionResult.valid) {
    issues.push(reductionResult.issue);
  }

  if (!dieResult.valid || !multiplierResult.valid || !abilityResult.valid || !reductionResult.valid) {
    result.valid = false;
    return result;
  }

  const effectiveMultiplier = Math.max(0, multiplierResult.value - reductionResult.value);
  if (multiplierResult.value - reductionResult.value < 0) {
    issues.push(createIssue("warning", "NEGATIVE_EFFECTIVE_MULTIPLIER_CLAMPED", "Damage reduction exceeded damage multiplier; effective multiplier was clamped to zero.", { fieldName: "damageReduction" }));
  }
  result.normalized.effectiveMultiplier = effectiveMultiplier;

  const dieContribution = dieResult.value * effectiveMultiplier;
  const abilityContribution = abilityResult.value;
  const subtotal = dieContribution + abilityContribution;
  const fantasticMultiplier = normalizeBoolean(isFantastic) ? 2 : 1;
  const finalDamage = subtotal * fantasticMultiplier;

  result.calculation.dieContribution = dieContribution;
  result.calculation.abilityContribution = abilityContribution;
  result.calculation.subtotal = subtotal;
  result.calculation.fantasticMultiplier = fantasticMultiplier;
  result.calculation.finalDamage = finalDamage;
  result.valid = true;
  return result;
}

function getMarvelDieResult(roll) {
  if (!roll || typeof roll !== "object") return { valid: false, value: null, issues: [createIssue("warning", "MARVEL_DIE_MISSING", "No roll object was provided.")] };
  const candidates = [];
  if (Array.isArray(roll.dice)) {
    for (const term of roll.dice) {
      if (term && typeof term.result === "number" && Number.isFinite(term.result)) {
        candidates.push(term.result);
      }
    }
  }
  if (roll.terms && Array.isArray(roll.terms)) {
    for (const term of roll.terms) {
      if (term && typeof term?.result === "number" && Number.isFinite(term.result)) {
        candidates.push(term.result);
      }
    }
  }
  if (candidates.length === 1) return { valid: true, value: candidates[0], issues: [] };
  if (candidates.length > 1) return { valid: false, value: null, issues: [createIssue("warning", "MARVEL_DIE_AMBIGUOUS", "Multiple Marvel die results were found in the roll.", { candidates })] };
  return { valid: false, value: null, issues: [createIssue("warning", "MARVEL_DIE_MISSING", "No Marvel die result could be determined from the roll.")] };
}

function resolveFantasticRoll(roll, context = {}) {
  const explicit = typeof context?.isFantastic === "boolean" ? context.isFantastic : null;
  if (explicit !== null) return explicit;
  if (roll && typeof roll.isFantastic === "boolean") return roll.isFantastic;
  return false;
}

function getDamageReduction(actor, damageType) {
  if (!actor || typeof actor !== "object") return { damageType, path: damageType === "focus" ? "system.focusDamageReduction" : "system.healthDamageReduction", rawValue: null, normalizedValue: 0, applied: false, issues: [createIssue("warning", "DAMAGE_REDUCTION_INVALID", "No actor was provided.")] };
  const path = damageType === "focus" ? "system.focusDamageReduction" : "system.healthDamageReduction";
  const rawValue = typeof globalThis.foundry?.utils?.getProperty === "function"
    ? globalThis.foundry.utils.getProperty(actor, path)
    : path.split(".").reduce((acc, part) => acc?.[part], actor);
  const parsed = normalizeNumericInput(rawValue, { requireInteger: true, fieldName: "damageReduction" });
  if (!parsed.valid) {
    return { damageType, path, rawValue, normalizedValue: 0, applied: false, issues: [parsed.issue] };
  }
  const normalizedValue = Math.max(0, parsed.value);
  return { damageType, path, rawValue, normalizedValue, applied: normalizedValue > 0, issues: [] };
}

function resolveRollSource(message, options = {}) {
  const actorUuid = options.actorUuid ?? options.actor?.uuid ?? null;
  const tokenUuid = options.tokenUuid ?? options.token?.uuid ?? options.token?.document?.uuid ?? null;
  const itemUuid = options.itemUuid ?? options.item?.uuid ?? null;
  const actor = options.actor ?? (actorUuid ? globalThis.fromUuidSync?.(actorUuid) : null) ?? null;
  const tokenDocument = options.token ?? (tokenUuid ? globalThis.fromUuidSync?.(tokenUuid) : null) ?? null;
  const item = options.item ?? (itemUuid ? globalThis.fromUuidSync?.(itemUuid) : null) ?? null;
  const issues = [];
  if (!actor) issues.push(createIssue("warning", "ROLL_SOURCE_ACTOR_MISSING", "The source actor could not be resolved by UUID."));
  if (!item) issues.push(createIssue("warning", "ROLL_SOURCE_ITEM_MISSING", "The source item could not be resolved by UUID."));
  return { actor, tokenDocument, item, actorUuid, tokenUuid, itemUuid, issues };
}

function resolveTargetActor(target, fallbackActor = null) {
  const targetUuid = target?.uuid ?? null;
  if (!targetUuid || typeof globalThis.fromUuidSync !== "function") {
    return fallbackActor;
  }

  const resolved = globalThis.fromUuidSync(targetUuid);
  if (!resolved) return fallbackActor;
  return resolved?.actor ?? resolved;
}

export async function buildDamageContext(message, options = {}) {
  const rollContext = options.rollContext ?? getRollContext(message) ?? null;
  const attackResolution = options.attackResolution ?? null;
  const source = resolveRollSource(message, {
    actor: options.actor,
    token: options.token,
    item: options.item,
    actorUuid: rollContext?.actorUuid ?? options.actorUuid,
    tokenUuid: rollContext?.tokenUuid ?? options.tokenUuid,
    itemUuid: rollContext?.itemUuid ?? options.itemUuid,
  });
  const damageType = normalizeDamageType(rollContext?.damageType ?? options.damageType ?? null) ?? null;
  const element = normalizeElement(rollContext?.element ?? options.element ?? null) ?? null;
  const abilityValue = rollContext?.abilityValue ?? options.abilityValue ?? null;
  const damageMultiplier = rollContext?.baseDamageMultiplier ?? rollContext?.damageMultiplier ?? options.damageMultiplier ?? null;
  const damageReduction = rollContext?.damageReduction ?? options.damageReduction ?? null;
  const marvelDieResult = options.roll?.marvelDieResult ?? rollContext?.marvelDieResult ?? null;
  const dieResolution = getMarvelDieResult(options.roll ?? { dice: [] });
  const resolvedDie = dieResolution.valid ? dieResolution.value : (typeof marvelDieResult === "number" ? marvelDieResult : null);
  const isFantasticRoll = resolveFantasticRoll(options.roll, { isFantastic: rollContext?.isFantastic ?? options.isFantastic });
  const baseAbilityValue = typeof abilityValue === "number" ? abilityValue : (source.actor?.system?.abilities?.[rollContext?.ability ?? options.ability]?.value ?? null);
  const baseDamageMultiplier = typeof damageMultiplier === "number" ? damageMultiplier : (source.actor?.system?.abilities?.[rollContext?.ability ?? options.ability]?.damageMultiplier ?? null);
  const reductionData = getDamageReduction(source.actor, damageType);
  const damageCalculation = calculateMarvelDamage({
    marvelDie: resolvedDie,
    damageMultiplier: baseDamageMultiplier,
    abilityValue: baseAbilityValue,
    damageReduction: reductionData.normalizedValue,
    isFantastic: isFantasticRoll,
    options: { damageType, element },
  });
  const targetEntries = [];
  for (const target of Array.isArray(attackResolution?.targets) ? attackResolution.targets : []) {
    if (target?.outcome !== "hit" && target?.outcome !== "fantastic-hit") continue;
    const targetActor = resolveTargetActor(target, source.actor);
    const targetReduction = getDamageReduction(targetActor, damageType);
    const targetCalculation = calculateMarvelDamage({
      marvelDie: resolvedDie,
      damageMultiplier: baseDamageMultiplier,
      abilityValue: baseAbilityValue,
      damageReduction: targetReduction.normalizedValue,
      isFantastic: isFantasticRoll,
      options: { damageType, element },
    });
    targetEntries.push({
      targetUuid: target?.uuid ?? null,
      damageReduction: targetReduction.normalizedValue,
      effectiveDamageMultiplier: targetCalculation.normalized.effectiveMultiplier,
      finalDamage: targetCalculation.calculation.finalDamage,
    });
  }
  const context = {
    version: DAMAGE_CONTEXT_VERSION,
    calculatedAt: Date.now(),
    actorUuid: source.actor?.uuid ?? rollContext?.actorUuid ?? null,
    tokenUuid: source.tokenDocument?.uuid ?? rollContext?.tokenUuid ?? null,
    itemUuid: source.item?.uuid ?? rollContext?.itemUuid ?? null,
    damageType,
    element,
    dealsDamage: Boolean(rollContext?.dealsDamage ?? options.dealsDamage),
    ability: normalizeAbilityKey(rollContext?.ability ?? options.ability) ?? null,
    abilityValue: baseAbilityValue,
    marvelDie: resolvedDie,
    baseDamageMultiplier: baseDamageMultiplier,
    damageReduction: reductionData.normalizedValue,
    effectiveDamageMultiplier: damageCalculation.normalized.effectiveMultiplier,
    isFantasticRoll,
    isFantasticHit: Boolean(attackResolution?.targets?.some((target) => target?.outcome === "fantastic-hit")),
    fantasticAppliedToDamage: isFantasticRoll && Boolean(attackResolution?.targets?.some((target) => target?.outcome === "fantastic-hit")),
    rawDamage: damageCalculation.calculation.subtotal,
    finalDamage: damageCalculation.calculation.finalDamage,
    reductionAlreadyApplied: true,
    issues: [...source.issues, ...damageCalculation.issues],
    targets: targetEntries,
    valid: damageCalculation.valid && !source.issues.length,
  };

  if (!context.damageType && rollContext?.damageType) {
    context.damageType = normalizeDamageType(rollContext.damageType);
  }
  if (message && typeof message.update === "function") {
    await updateChatMessageFlags(message, { "marvel-multiverse": { damageContext: context } });
  }
  return context;
}

export function getDamageContext(message) {
  if (!message) return null;
  return typeof message?.getFlag === "function" ? message.getFlag("marvel-multiverse", "damageContext") ?? null : null;
}

export async function refreshDamageContext(message, options = {}) {
  const before = getDamageContext(message) ?? null;
  const after = await buildDamageContext(message, options);
  return { before, after };
}

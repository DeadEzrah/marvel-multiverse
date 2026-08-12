/**
 * Centralized damage resolution for the Universal Action Roll workflow.
 *
 * `resolveDamage()` is a pure calculation step - it never mutates a document and never
 * re-judges whether the attack hit. It trusts the already-normalized Roll Result produced by
 * `lib/services/action-roll.mjs` (`rollResult.isSuccess`) exactly as the spec requires, and
 * reuses the existing, already-audited Marvel damage formula in `lib/damage-calculation.mjs`
 * (`calculateMarvelDamage`: `(marvelDie * max(0, multiplier - reduction) + abilityValue) *
 * fantasticMultiplier`, where a Fantastic result doubles the subtotal) rather than inventing a
 * new one.
 *
 * `applyResolvedDamage()` is the separate, explicit "update the target Actor" step (a plain
 * Foundry document update against `system.health.value`/`system.focus.value`), permission-checked
 * via the existing `hasActorMutationPermission` helper so it never silently corrupts an Actor a
 * player doesn't own.
 */
import { calculateMarvelDamage } from "../damage-calculation.mjs";
import { hasActorMutationPermission } from "./mutation-preflight.mjs";

const ABILITY_KEYS = ["mle", "agl", "res", "vig", "ego", "log"];
const ABILITY_ALIASES = {
  mle: "mle", melee: "mle", close: "mle",
  agl: "agl", agility: "agl",
  res: "res", resilience: "res",
  vig: "vig", vigilance: "vig",
  ego: "ego",
  log: "log", logic: "log",
};
const DAMAGE_TYPES = ["health", "focus"];

export const DAMAGE_RESOLUTION_VERSION = 1;

function normalizeAbilityKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ABILITY_ALIASES[normalized] ?? (ABILITY_KEYS.includes(normalized) ? normalized : null);
}

function normalizeDamageType(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return DAMAGE_TYPES.includes(normalized) ? normalized : null;
}

function getReductionFieldName(damageType) {
  return damageType === "focus" ? "focusDamageReduction" : "healthDamageReduction";
}

function readActorNumber(actor, path) {
  const value = typeof globalThis.foundry?.utils?.getProperty === "function"
    ? globalThis.foundry.utils.getProperty(actor, path)
    : path.split(".").reduce((acc, part) => acc?.[part], actor);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Declarative damage config for an action. An Item may opt in to an explicit
 * `system.damage = { enabled, ability, multiplier, modifier, type }` object; otherwise (the
 * common case, requiring zero Item data migration) it's adapted from the existing
 * `attack`/`attackTarget`/`attackKind`/`attackMultiplier`/`damageType` fields already on every
 * weapon/power, mirroring the same layered-config pattern `resolveTargetingConfig` already uses
 * in lib/services/action-roll.mjs.
 */
export function resolveDamageConfig(item, options = {}) {
  const itemSystem = item?.system ?? {};
  const explicit = itemSystem.damage;
  if (explicit && typeof explicit === "object") {
    return {
      enabled: Boolean(explicit.enabled),
      ability: normalizeAbilityKey(explicit.ability) ?? normalizeAbilityKey(options.ability ?? itemSystem.ability) ?? null,
      multiplier: Number.isFinite(Number(explicit.multiplier)) ? Number(explicit.multiplier) : null,
      modifier: Number.isFinite(Number(explicit.modifier)) ? Number(explicit.modifier) : 0,
      damageType: normalizeDamageType(explicit.type) ?? "health",
    };
  }

  const hasAttackMultiplier = Number.isFinite(Number(itemSystem.attackMultiplier)) && Number(itemSystem.attackMultiplier) > 0;
  const hasDamageType = typeof itemSystem.damageType === "string" && itemSystem.damageType.trim().length > 0;
  const isAttack = Boolean(itemSystem.attack || itemSystem.attackTarget || itemSystem.attackKind || hasAttackMultiplier || hasDamageType);
  const enabled = typeof options.dealsDamage === "boolean" ? options.dealsDamage : isAttack;

  return {
    enabled,
    ability: normalizeAbilityKey(options.ability ?? itemSystem.ability) ?? null,
    multiplier: hasAttackMultiplier ? Number(itemSystem.attackMultiplier) : null,
    modifier: 0,
    damageType: normalizeDamageType(itemSystem.damageType) ?? "health",
  };
}

function baseResult(damageConfig, rollResult) {
  return {
    version: DAMAGE_RESOLUTION_VERSION,
    enabled: Boolean(damageConfig.enabled),
    hit: false,
    reason: null,
    damageType: damageConfig.damageType,
    ability: damageConfig.ability,
    marvelDie: null,
    abilityValue: null,
    modifier: damageConfig.modifier ?? 0,
    baseDamageMultiplier: null,
    damageReduction: 0,
    effectiveMultiplier: null,
    isFantastic: Boolean(rollResult?.isFantastic),
    fantasticMultiplier: 1,
    baseDamage: null,
    fantasticBonus: 0,
    finalDamage: 0,
    issues: [],
  };
}

/**
 * `DamageResolver.resolve()`. Calculates (but never applies) damage for a completed action roll.
 *
 * - Non-damaging actions (`damageConfig.enabled` false) return `{ hit: false, reason:
 *   "damage-not-configured" }` immediately - the caller should skip damage entirely.
 * - A failed/unresolved roll returns `{ hit: false, reason: "no-hit" }` without recalculating
 *   success - `rollResult.isSuccess` (from the normalized Roll Result) is trusted as-is.
 * - A missing target actor, an unrecognized ability/damage type, or an invalid multiplier all
 *   return `{ hit: false, reason: <code>, issues: [...] }` rather than throwing or guessing.
 */
export function resolveDamage({ attacker, target, source, rollContext, rollResult, config } = {}) {
  const damageConfig = config ?? resolveDamageConfig(source, rollContext ?? {});
  const result = baseResult(damageConfig, rollResult);

  if (!damageConfig.enabled) {
    return { ...result, reason: "damage-not-configured" };
  }
  // "Do not re-evaluate whether the attack succeeded in the Damage Resolver" - the normalized
  // Roll Result's own `isSuccess` is the single source of truth for hit/miss.
  if (!rollResult || !rollResult.isSuccess) {
    return { ...result, reason: "no-hit" };
  }
  if (!target || typeof target !== "object") {
    return {
      ...result,
      reason: "target-missing",
      issues: [{ severity: "warning", code: "TARGET_MISSING", message: "No target actor was available for damage resolution." }],
    };
  }

  const abilityKey = damageConfig.ability ?? normalizeAbilityKey(rollContext?.ability) ?? null;
  const issues = [];
  if (!abilityKey) {
    issues.push({ severity: "warning", code: "DAMAGE_ABILITY_INVALID", message: "No valid ability could be determined for the damage calculation." });
  }

  const marvelDie = typeof rollResult.marvelDie === "number" && Number.isFinite(rollResult.marvelDie) ? rollResult.marvelDie : null;
  if (marvelDie === null) {
    issues.push({ severity: "warning", code: "MARVEL_DIE_MISSING", message: "No Marvel die result was available from the roll." });
  }

  const attackerAbilityValue = abilityKey ? readActorNumber(attacker, `system.abilities.${abilityKey}.value`) ?? 0 : 0;
  const abilityDamageMultiplier = abilityKey ? readActorNumber(attacker, `system.abilities.${abilityKey}.damageMultiplier`) : null;
  const damageMultiplier = typeof damageConfig.multiplier === "number" ? damageConfig.multiplier : (abilityDamageMultiplier ?? 0);
  const damageReduction = readActorNumber(target, `system.${getReductionFieldName(damageConfig.damageType)}`) ?? 0;

  if (marvelDie === null || !abilityKey) {
    return {
      ...result,
      marvelDie,
      abilityValue: attackerAbilityValue,
      baseDamageMultiplier: damageMultiplier,
      damageReduction,
      reason: "invalid-config",
      issues,
    };
  }

  const calculation = calculateMarvelDamage({
    marvelDie,
    damageMultiplier,
    abilityValue: attackerAbilityValue + (damageConfig.modifier ?? 0),
    damageReduction,
    isFantastic: rollResult.isFantastic,
    options: { damageType: damageConfig.damageType },
  });
  issues.push(...calculation.issues);

  if (!calculation.valid) {
    return {
      ...result,
      marvelDie,
      abilityValue: attackerAbilityValue,
      baseDamageMultiplier: damageMultiplier,
      damageReduction,
      reason: "invalid-calculation",
      issues,
    };
  }

  const finalDamage = Math.max(0, Math.round(calculation.calculation.finalDamage));
  return {
    ...result,
    hit: true,
    reason: null,
    marvelDie,
    abilityValue: attackerAbilityValue,
    baseDamageMultiplier: damageMultiplier,
    damageReduction,
    effectiveMultiplier: calculation.normalized.effectiveMultiplier,
    fantasticMultiplier: calculation.calculation.fantasticMultiplier,
    baseDamage: calculation.calculation.subtotal,
    fantasticBonus: finalDamage - calculation.calculation.subtotal,
    finalDamage,
    issues,
  };
}

function clampResourceValue(value, max) {
  const clampedMin = Math.max(0, value);
  return typeof max === "number" && Number.isFinite(max) && max > 0 ? Math.min(clampedMin, max) : clampedMin;
}

// Mirrors `buildUpdateData` in lib/damage-application.mjs - builds a nested update payload
// (`{system: {health: {value}}}`) rather than a dotted-path key, matching this project's
// established Actor-update convention.
function buildResourceUpdateData(resourceKey, value) {
  return { system: { [resourceKey]: { value } } };
}

/**
 * Applies a `resolveDamage()` result to the target Actor's Health/Focus via a normal Foundry
 * document update - never touches token-bar HTML directly. GM-authoritative: uses the existing
 * `hasActorMutationPermission` check (GM or Actor owner) so a player without permission gets a
 * clear `{success:false, reason:"permission-denied"}` instead of a silent/insecure client-side
 * write. Never applies a negative/NaN amount and always clamps the result into `[0, max]`.
 */
export async function applyResolvedDamage(target, resolution, options = {}) {
  if (!resolution?.hit) {
    return { success: false, reason: "not-applicable" };
  }
  if (!Number.isFinite(resolution.finalDamage) || resolution.finalDamage < 0) {
    return { success: false, reason: "invalid-damage-amount" };
  }
  if (!target || typeof target !== "object") {
    return { success: false, reason: "actor-missing" };
  }
  if (!hasActorMutationPermission(target, options)) {
    return { success: false, reason: "permission-denied" };
  }

  const resourceKey = resolution.damageType === "focus" ? "focus" : "health";
  const currentValue = readActorNumber(target, `system.${resourceKey}.value`);
  if (currentValue === null) {
    return { success: false, reason: "resource-missing" };
  }
  const maxValue = readActorNumber(target, `system.${resourceKey}.max`);
  const nextValue = clampResourceValue(currentValue - resolution.finalDamage, maxValue);

  try {
    if (typeof target.update === "function") {
      await target.update(buildResourceUpdateData(resourceKey, nextValue));
    } else if (typeof target.parent?.update === "function") {
      await target.parent.update(buildResourceUpdateData(resourceKey, nextValue));
    } else {
      return { success: false, reason: "update-unavailable" };
    }
  } catch (error) {
    console.error("Marvel Multiverse | Damage resolver: failed to update target Health/Focus.", error);
    return { success: false, reason: "update-failed" };
  }

  return {
    success: true,
    resourceKey,
    previousValue: currentValue,
    newValue: nextValue,
    appliedDamage: currentValue - nextValue,
  };
}

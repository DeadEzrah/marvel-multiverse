import { getRollContext, migrateLegacyRollContext } from "../roll-context.mjs";
import { refreshAttackResolution } from "../attack-resolution.mjs";
import { refreshDamageContext } from "../damage-calculation.mjs";
import { updateChatMessageFlags } from "../chat-message-state.mjs";

function unwrapRefreshResult(result) {
  if (!result || typeof result !== "object") return result ?? null;
  if (Object.prototype.hasOwnProperty.call(result, "after")) {
    return result.after ?? null;
  }
  return result;
}

function buildFallbackRollContext(message, rollContext = null, damageContext = null) {
  const fallback = {
    version: 1,
    rollType: rollContext?.rollType ?? (damageContext ? "ability" : "ability"),
    userId: rollContext?.userId ?? null,
    timestamp: rollContext?.timestamp ?? damageContext?.calculatedAt ?? message?.timestamp ?? null,
    actorUuid: rollContext?.actorUuid ?? null,
    tokenUuid: rollContext?.tokenUuid ?? null,
    itemUuid: rollContext?.itemUuid ?? null,
    targetUuids: Array.isArray(rollContext?.targetUuids) ? rollContext.targetUuids : [],
    ability: rollContext?.ability ?? null,
    attackTarget: rollContext?.attackTarget ?? null,
    attackKind: rollContext?.attackKind ?? null,
    attackEdgeMode: rollContext?.attackEdgeMode ?? null,
    damageType: rollContext?.damageType ?? damageContext?.damageType ?? null,
    element: rollContext?.element ?? null,
    dealsDamage: typeof rollContext?.dealsDamage === "boolean"
      ? rollContext.dealsDamage
      : Boolean(damageContext?.dealsDamage ?? damageContext?.finalDamage != null),
    focusCost: rollContext?.focusCost ?? null,
    duration: rollContext?.duration ?? null,
    requiresConcentration: Boolean(rollContext?.requiresConcentration ?? false),
    rollTotal: rollContext?.rollTotal ?? damageContext?.finalDamage ?? null,
    marvelDieResult: rollContext?.marvelDieResult ?? null,
    isFantastic: rollContext?.isFantastic ?? null,
    hasEdge: rollContext?.hasEdge ?? null,
    hasTrouble: rollContext?.hasTrouble ?? null,
    source: {
      itemName: rollContext?.source?.itemName ?? null,
      powerSet: rollContext?.source?.powerSet ?? null,
      costText: rollContext?.source?.costText ?? null,
      rangeText: rollContext?.source?.rangeText ?? null,
    },
    warnings: Array.isArray(rollContext?.warnings) ? rollContext.warnings : [],
  };

  if (damageContext?.targets?.length) {
    fallback.targetUuids = damageContext.targets
      .map((entry) => entry?.targetUuid ?? null)
      .filter(Boolean);
  }

  return fallback;
}

export async function refreshCombatAutomationState(message, options = {}) {
  const deps = {
    getRollContext,
    migrateLegacyRollContext,
    updateChatMessageFlags,
    refreshAttackResolution,
    refreshDamageContext,
    ...options.dependencies,
  };

  if (!message || typeof message !== "object") return null;

  let rollContext = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext") ?? null
    : null;
  rollContext ??= await deps.getRollContext(message);

  if (!rollContext) {
    const legacyContext = await deps.migrateLegacyRollContext(message);
    if (legacyContext) {
      await deps.updateChatMessageFlags(message, { "marvel-multiverse": { rollContext: legacyContext } });
    }
    rollContext = legacyContext ?? null;
  }

  const messageDamageContext = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "damageContext") ?? null
    : null;
  const hasStoredRoll = Boolean(message?.rolls && typeof message.rolls.length === "number" && message.rolls.length > 0);
  const fallbackContext = rollContext || messageDamageContext || hasStoredRoll
    ? buildFallbackRollContext(message, rollContext, messageDamageContext)
    : null;
  if (fallbackContext && typeof message?.update === "function") {
    const existingContext = typeof message?.getFlag === "function"
      ? message.getFlag("marvel-multiverse", "rollContext") ?? null
      : null;
    const needsUpdate = !existingContext || JSON.stringify(existingContext) !== JSON.stringify(fallbackContext);
    if (needsUpdate) {
      await deps.updateChatMessageFlags(message, { "marvel-multiverse": { rollContext: fallbackContext } });
    }
  }

  rollContext = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext") ?? null
    : null;
  if (!rollContext && fallbackContext) {
    rollContext = fallbackContext;
  }

  if (rollContext && typeof rollContext.dealsDamage !== "boolean" && rollContext.damageType) {
    rollContext.dealsDamage = true;
    if (typeof message?.update === "function") {
      const nextRollContext = { ...rollContext };
      await deps.updateChatMessageFlags(message, { "marvel-multiverse": { rollContext: nextRollContext } });
    }
  }

  let attackResolution = null;
  if (rollContext?.rollType === "attack") {
    const currentResolution = typeof message?.getFlag === "function"
      ? message.getFlag("marvel-multiverse", "attackResolution") ?? null
      : null;
    if (!currentResolution) {
      const refreshedAttack = await deps.refreshAttackResolution(message, { quiet: true, store: true });
      attackResolution = unwrapRefreshResult(refreshedAttack);
      if (attackResolution && typeof message?.update === "function") {
        await deps.updateChatMessageFlags(message, { "marvel-multiverse": { attackResolution } });
      }
    } else {
      attackResolution = currentResolution;
    }
  }

  let damageContext = null;
  if (rollContext?.dealsDamage) {
    const currentDamageContext = typeof message?.getFlag === "function"
      ? message.getFlag("marvel-multiverse", "damageContext") ?? null
      : null;
    if (!currentDamageContext) {
      const refreshedDamage = await deps.refreshDamageContext(message, { quiet: true });
      damageContext = unwrapRefreshResult(refreshedDamage);
      if (damageContext && typeof message?.update === "function") {
        await deps.updateChatMessageFlags(message, { "marvel-multiverse": { damageContext } });
      }
    } else {
      damageContext = currentDamageContext;
    }
  }

  return {
    rollContext: typeof message?.getFlag === "function"
      ? message.getFlag("marvel-multiverse", "rollContext") ?? null
      : null,
    attackResolution,
    damageContext,
  };
}

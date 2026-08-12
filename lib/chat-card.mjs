import { refreshCombatAutomationState } from "./services/combat-workflow.mjs";

function resolveAbilityLabel(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const labels = {
    mle: "Melee",
    agl: "Agility",
    res: "Resilience",
    vig: "Vigilance",
    ego: "Ego",
    log: "Logic",
  };
  return labels[normalized] ?? value.trim();
}

function resolveDamageTypeLabel(value) {
  if (typeof value !== "string") return "damage";
  const normalized = value.trim().toLowerCase();
  return normalized === "focus" ? "focus" : normalized === "health" ? "health" : normalized || "damage";
}

function buildLocalizedSummary(messageKey, fallback, replacements = {}) {
  const i18n = typeof globalThis !== "undefined" ? globalThis.game?.i18n : undefined;
  if (typeof i18n?.localize === "function") {
    try {
      const template = i18n.localize(messageKey);
      return Object.entries(replacements).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template || fallback);
    } catch {
      // Ignore localization failures and fall back to the plain English summary.
    }
  }
  return fallback;
}

const GUIDED_PHASE_ORDER = ["configure", "roll", "resolve", "apply"];

const GUIDED_PHASE_LABELS = {
  configure: { key: "MARVEL_MULTIVERSE.GuidedPhase.Configure", fallback: "Configure" },
  roll: { key: "MARVEL_MULTIVERSE.GuidedPhase.Roll", fallback: "Roll" },
  resolve: { key: "MARVEL_MULTIVERSE.GuidedPhase.Resolve", fallback: "Resolve" },
  apply: { key: "MARVEL_MULTIVERSE.GuidedPhase.Apply", fallback: "Apply" },
};

export function isCompactRollCard(rollContext = {}, options = {}) {
  return options?.initiativeRoll === true
    || rollContext?.cardPresentation === "compact"
    || rollContext?.actionType === "initiative";
}

function resolveGuidedStepStatus(phaseKey, guidedResolution) {
  if (phaseKey === "configure") return "complete";
  if (phaseKey === "roll") return guidedResolution?.roll?.status === "rolled" ? "complete" : "upcoming";
  if (phaseKey === "resolve") return guidedResolution?.resolve?.status === "resolved" ? "complete" : "current";
  if (phaseKey === "apply") {
    const status = guidedResolution?.apply?.status;
    if (status === "not-required") return "not-required";
    if (status === "applied") return "complete";
    return guidedResolution?.resolve?.status === "resolved" ? "current" : "upcoming";
  }
  return "upcoming";
}

/**
 * Build the Configure/Roll/Resolve/Apply step data for the guided resolution progress indicator.
 * For "manual" mode powers (resolution the system cannot safely automate), return a single
 * "manual resolution required" indicator instead of guessing at automated phase progress.
 * @param {object|null} guidedResolution   The `guidedResolution` chat message flag payload.
 * @returns {Array<{key:string,label:string,status:string}>|null}
 */
export function buildGuidedResolutionStepper(guidedResolution) {
  if (!guidedResolution || typeof guidedResolution !== "object") return null;
  if (guidedResolution.mode === "manual") {
    return [{
      key: "manual",
      label: buildLocalizedSummary("MARVEL_MULTIVERSE.GuidedPhase.ManualRequired", "Manual Resolution Required"),
      status: "manual",
    }];
  }
  return GUIDED_PHASE_ORDER.map((key) => {
    const { key: labelKey, fallback } = GUIDED_PHASE_LABELS[key];
    return {
      key,
      label: buildLocalizedSummary(labelKey, fallback),
      status: resolveGuidedStepStatus(key, guidedResolution),
    };
  });
}

export function buildRollCardMeta(rollContext = {}, attackResolution = null, damageContext = null) {
  const badges = [];
  const attackTargets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];
  const hitCount = attackTargets.filter((target) => target?.outcome === "hit" || target?.outcome === "fantastic-hit").length;
  const fantasticCount = attackTargets.filter((target) => target?.outcome === "fantastic-hit").length;
  const missCount = attackTargets.filter((target) => target?.outcome === "miss").length;

  if (rollContext?.rollType === "attack") {
    if (attackTargets.length) {
      badges.push(`${hitCount}/${attackTargets.length} hit`);
      if (fantasticCount) badges.push(`${fantasticCount} fantastic`);
      if (missCount) badges.push(`${missCount} miss`);
    } else if (rollContext?.attackTarget) {
      badges.push(`vs ${resolveAbilityLabel(rollContext.attackTarget) ?? rollContext.attackTarget}`);
    }
  }

  const damageValue = Number(damageContext?.finalDamage ?? rollContext?.rollTotal ?? 0);
  const damageTypeLabel = resolveDamageTypeLabel(rollContext?.damageType ?? damageContext?.damageType ?? null);
  const shouldMentionDamage = Boolean(
    rollContext?.dealsDamage || damageContext?.dealsDamage || rollContext?.damageType || damageContext?.damageType,
  );
  if (shouldMentionDamage && damageValue > 0) {
    badges.push(`${damageValue} ${damageTypeLabel === "damage" ? "dmg" : damageTypeLabel === "health" ? "dmg" : damageTypeLabel}`);
  }

  return {
    badges,
  };
}

export function buildRollSummary(rollContext = {}, attackResolution = null, damageContext = null) {
  const summaryItems = [];
  const attackTargetLabel = resolveAbilityLabel(rollContext?.attackTarget);

  if (rollContext?.rollType === "attack" && attackTargetLabel) {
    summaryItems.push(buildLocalizedSummary(
      "MARVEL_MULTIVERSE.RollSummary.AttackRollVs",
      `Attack roll vs ${attackTargetLabel}`,
      { ability: attackTargetLabel },
    ));
  }

  if (rollContext?.hasEdge) {
    summaryItems.push(buildLocalizedSummary("MARVEL_MULTIVERSE.RollSummary.EdgeApplied", "Edge applied"));
  } else if (rollContext?.hasTrouble) {
    summaryItems.push(buildLocalizedSummary("MARVEL_MULTIVERSE.RollSummary.TroubleApplied", "Trouble applied"));
  }

  const damageTypeLabel = resolveDamageTypeLabel(rollContext?.damageType ?? damageContext?.damageType ?? null);
  const targetCount = Math.max(
    Array.isArray(attackResolution?.targets) ? attackResolution.targets.length : 0,
    Array.isArray(damageContext?.targets) ? damageContext.targets.length : 0,
    Array.isArray(rollContext?.targetUuids) ? rollContext.targetUuids.length : 0,
    0,
  );
  const shouldMentionDamage = Boolean(
    rollContext?.dealsDamage || damageContext?.dealsDamage || rollContext?.damageType || damageContext?.damageType,
  );

  if (shouldMentionDamage && targetCount > 0) {
    const targetText = targetCount === 1 ? "1 target" : `${targetCount} targets`;
    summaryItems.push(buildLocalizedSummary(
      "MARVEL_MULTIVERSE.RollSummary.DealsDamage",
      `Deals ${damageTypeLabel} damage to ${targetText}`,
      { damageType: damageTypeLabel, count: targetText },
    ));
  }

  return {
    summaryItems,
    summaryText: summaryItems.join(" • "),
  };
}

export async function hydrateChatAutomationState(message) {
  if (!message || typeof message !== "object") return null;
  const hydrated = await refreshCombatAutomationState(message);
  const rollContext = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext") ?? null
    : null;
  const fallbackRollContext = hydrated?.rollContext ?? (rollContext ? { ...rollContext } : null);
  return {
    ...hydrated,
    rollContext: fallbackRollContext,
  };
}

export function normalizeChatElement(html) {
  if (!html) return null;
  if (typeof html === "string") return null;

  const ElementCtor = typeof globalThis !== "undefined" ? globalThis.HTMLElement : undefined;
  if (typeof ElementCtor !== "undefined" && html instanceof ElementCtor) return html;

  const elementNode = typeof globalThis !== "undefined" && typeof globalThis.Node !== "undefined"
    ? globalThis.Node.ELEMENT_NODE
    : 1;

  if (html?.nodeType === elementNode) return html;
  if (typeof html?.querySelectorAll === "function") return html;
  if (typeof html?.querySelector === "function") return html;
  if (html?.[0]?.nodeType === elementNode) return html[0];
  if (typeof ElementCtor !== "undefined" && html?.[0] instanceof ElementCtor) return html[0];
  return null;
}

export function hasDiceRoll(message) {
  return Boolean(message?.rolls && typeof message.rolls.length === "number" && message.rolls.length > 0);
}

export function resolveChatActionContainer(html) {
  const root = normalizeChatElement(html);
  if (!root) return null;

  const rollResult = root.querySelector(".marvel-roll .dice-result");
  if (rollResult) return rollResult;

  const preferred = root.querySelector(".marvel-roll .damage")?.parentElement;
  if (preferred) return preferred;

  const chatCard = root.querySelector(".marvel-multiverse.chat-card");
  if (chatCard) return chatCard;

  return root.querySelector(".message-content") ?? root;
}

export function attachClickHandler(html, selector, handler, context = {}) {
  if (typeof handler !== "function") return;
  const root = normalizeChatElement(html);
  if (!root) return;

  for (const element of root.querySelectorAll(selector)) {
    if (!element || typeof element.addEventListener !== "function") continue;
    element.addEventListener("click", (event) => {
      event?.stopPropagation?.();
      handler.call(context, event);
    });
  }

  return true;
}

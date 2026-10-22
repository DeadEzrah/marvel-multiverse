import { updateChatMessageFlags } from "../chat-message-state.mjs";
import { parseFocusCost, spendActorFocus } from "../focus-automation.mjs";
import { buildRollContext } from "../roll-context.mjs";
import {
  findLineOfSightBlockedTarget,
  measureTokenRangeSpaces,
  resolveTargetingConfig,
} from "./action-roll.mjs";
import { promptDialog } from "./dialog-compat.mjs";
import { createEffectProfileSession } from "./effect-profile-manager.mjs";
import { autoEvaluatePowerEvents } from "./power-events.mjs";
import { resolveLatestReactionContext, resolveReactionTarget } from "./reaction-context.mjs";
import { evaluateTargetPrerequisites } from "./target-prerequisites.mjs";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function normalizeTargets(targets, actor, includeSelf = false) {
  const values = Array.isArray(targets)
    ? targets
    : targets && typeof targets === "object" ? Array.from(targets) : [];
  return values.filter((target) => {
    const targetActor = target?.actor ?? target?.document?.actor ?? null;
    const isSelf = targetActor === actor || targetActor?.uuid === actor?.uuid;
    return (targetActor || target?.uuid) && (includeSelf || !isSelf);
  });
}

function resolveUtilityTargeting(source, actor) {
  return resolveTargetingConfig({
    system: source?.system ?? {},
    actor,
    parent: actor,
  });
}

export function resolveUtilityTargetLimits(source, actor) {
  const activation = source?.system?.activation ?? {};
  const targeting = resolveUtilityTargeting(source, actor);
  const rank = Math.max(1, Number(actor?.system?.attributes?.rank?.value ?? actor?.system?.rank?.value ?? 1));
  const required = activation.target === "required" || targeting.required;
  const noTarget = activation.target === "none";
  const configuredMinimum = Number.isFinite(Number(activation.minTargets)) ? Number(activation.minTargets) : 0;
  const minimum = Math.max(required ? 1 : 0, configuredMinimum, targeting.minCount);
  const explicitMaximum = Number(activation.maxTargets);
  const perRankMaximum = Number(activation.maxTargetsPerRank);
  const maximum = noTarget
    ? 0
    : Number.isFinite(explicitMaximum) && explicitMaximum > 0
    ? explicitMaximum
    : Number.isFinite(perRankMaximum) && perRankMaximum > 0
      ? perRankMaximum * rank
      : targeting.required ? targeting.count : null;
  return { minimum, maximum, targeting };
}

function findOutOfRangeTarget(source, actor, sourceToken, targets, targeting = resolveUtilityTargeting(source, actor)) {
  const activation = source?.system?.activation ?? {};
  const rank = Math.max(1, Number(actor?.system?.attributes?.rank?.value ?? actor?.system?.rank?.value ?? 1));
  const fixedRange = Number(activation.range);
  const rangePerRank = Number(activation.rangePerRank);
  const maximum = Number.isFinite(fixedRange) && fixedRange > 0
    ? fixedRange
    : Number.isFinite(rangePerRank) && rangePerRank > 0 ? rangePerRank * rank : targeting.range;
  if (!Number.isFinite(maximum) || maximum <= 0 || !sourceToken) return null;
  for (const target of targets) {
    const distance = measureTokenRangeSpaces(sourceToken, target);
    if (Number.isFinite(distance) && distance > maximum + 0.001) return { target, distance, maximum };
  }
  return null;
}

function findTargetFilterMismatch(actor, sourceToken, targets, targeting) {
  if (targeting.targetFilter === "all") return null;
  const sourceDisposition = Number((sourceToken?.document ?? sourceToken)?.disposition);
  if (!Number.isFinite(sourceDisposition) || sourceDisposition === 0) return null;
  return targets.find((target) => {
    const targetActor = target?.actor ?? target?.document?.actor ?? null;
    if (targetActor === actor || targetActor?.uuid === actor?.uuid) return targeting.targetFilter !== "allies";
    const targetDisposition = Number((target?.document ?? target)?.disposition);
    if (!Number.isFinite(targetDisposition) || targetDisposition === 0) return true;
    return targeting.targetFilter === "enemies"
      ? targetDisposition !== -sourceDisposition
      : targetDisposition !== sourceDisposition;
  }) ?? null;
}

function getActorFocus(actor) {
  const value = Number(actor?.system?.focus?.value);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export const resolveLatestDamageReactionContext = resolveLatestReactionContext;

export async function resolveUtilityFocusAmount(source, actor, requestedAmount) {
  const cost = parseFocusCost(source?.system?.cost ?? "");
  if (!cost.valid) return { success: true, amount: 0 };
  if (cost.type === "fixed") return { success: true, amount: cost.value };
  if (cost.type !== "variable") return { success: false, reason: "unsupported-focus-cost" };

  const available = getActorFocus(actor);
  const minimum = Math.max(0, Number(cost.minimum) || 0);
  const maximum = cost.maximum !== null && cost.maximum !== undefined && Number.isFinite(Number(cost.maximum))
    ? Math.min(Number(cost.maximum), available)
    : available;
  if (maximum < minimum) return { success: false, reason: "insufficient-focus" };

  let amount = Number(requestedAmount);
  if (!Number.isInteger(amount)) {
    const selected = await promptDialog({
      title: `${source.name ?? "Power"} Focus`,
      content: `<div class="form-group"><label>Focus</label><input type="number" name="focusAmount" min="${minimum}" max="${maximum}" step="1" value="${minimum}"></div>`,
      label: "Activate",
      callback: (root) => Number(root?.querySelector?.('[name="focusAmount"]')?.value),
    });
    if (!Number.isInteger(selected)) return { success: false, reason: "cancelled" };
    amount = selected;
  }
  if (amount < minimum || amount > maximum) return { success: false, reason: "invalid-focus-amount" };
  return { success: true, amount };
}

function notifyTargetIssue(actionName, limits, count) {
  let message = `${actionName} requires at least ${limits.minimum} selected target${limits.minimum === 1 ? "" : "s"}.`;
  if (limits.maximum === 0 && count > 0) {
    message = `${actionName} does not use selected targets.`;
  } else if (limits.maximum !== null && count > limits.maximum) {
    message = `${actionName} allows no more than ${limits.maximum} selected target${limits.maximum === 1 ? "" : "s"}.`;
  }
  globalThis.ui?.notifications?.warn?.(message);
}

export async function activateUtilityPower({ actor, token = null, source, targets = [], focusAmount, effectsEnabled, effectLibrary } = {}) {
  if (!actor || !source) return { cancelled: true, error: "missing-source" };

  const reactionType = source.system?.activation?.reactionType;
  const reactionContext = reactionType ? resolveLatestReactionContext(actor, source) : null;
  if (reactionType && !reactionContext) {
    globalThis.ui?.notifications?.warn?.(`${source.name} requires an unresolved qualifying damage message.`);
    return { cancelled: true, error: "reaction-trigger-missing", message: null };
  }

  const reactionTarget = resolveReactionTarget(reactionContext);
  const limits = resolveUtilityTargetLimits(source, actor);
  const resolvedTargets = reactionTarget
    ? [reactionTarget]
    : normalizeTargets(targets, actor, limits.targeting.includeSelf);
  if (resolvedTargets.length < limits.minimum || (limits.maximum !== null && resolvedTargets.length > limits.maximum)) {
    notifyTargetIssue(source.name ?? "This power", limits, resolvedTargets.length);
    return { cancelled: true, error: "invalid-target-count", message: null };
  }
  const sourceToken = token?.object ?? token ?? actor?.token;
  const filterMismatch = findTargetFilterMismatch(actor, sourceToken, resolvedTargets, limits.targeting);
  if (filterMismatch) {
    globalThis.ui?.notifications?.warn?.(`${source.name} cannot target that character.`);
    return { cancelled: true, error: "target-filter-mismatch", message: null };
  }
  const rangeViolation = findOutOfRangeTarget(source, actor, sourceToken, resolvedTargets, limits.targeting);
  if (rangeViolation) {
    const targetName = rangeViolation.target?.name ?? rangeViolation.target?.document?.name ?? "A selected target";
    globalThis.ui?.notifications?.warn?.(`${targetName} is beyond ${rangeViolation.maximum} spaces for ${source.name}.`);
    return { cancelled: true, error: "target-out-of-range", message: null };
  }
  const lineOfSightBlocked = findLineOfSightBlockedTarget({
    targeting: limits.targeting,
    token: sourceToken,
    allTargets: resolvedTargets,
  });
  if (lineOfSightBlocked) {
    const targetName = lineOfSightBlocked?.name ?? lineOfSightBlocked?.document?.name ?? "A selected target";
    globalThis.ui?.notifications?.warn?.(`${targetName} is not within line of sight.`);
    return { cancelled: true, error: "target-line-of-sight-blocked", message: null };
  }
  const prerequisiteResult = evaluateTargetPrerequisites(actor, resolvedTargets, source.system?.targeting?.prerequisites);
  if (!prerequisiteResult.success) {
    globalThis.ui?.notifications?.warn?.(prerequisiteResult.failures[0].message);
    return { cancelled: true, error: "target-prerequisite-failed", message: null };
  }

  const focusSelection = await resolveUtilityFocusAmount(source, actor, focusAmount);
  if (!focusSelection.success) {
    if (focusSelection.reason !== "cancelled") {
      globalThis.ui?.notifications?.warn?.(`Focus could not be selected for ${source.name}.`);
    }
    return { cancelled: true, error: focusSelection.reason, message: null };
  }
  const focusCost = focusSelection.amount;
  const focusSpend = focusCost > 0 ? await spendActorFocus(actor, focusCost) : null;
  if (focusCost > 0 && !focusSpend?.success) {
    globalThis.ui?.notifications?.warn?.(focusSpend?.issues?.[0]?.message ?? `Focus could not be spent for ${source.name}.`);
    return { cancelled: true, error: "focus-spend-failed", message: null };
  }

  const effectSession = createEffectProfileSession(source, {
    actor,
    source,
    sourceToken: token?.object ?? token ?? actor?.token,
    targets: resolvedTargets.map((target) => target?.object ?? target),
  }, { enabled: effectsEnabled, library: effectLibrary });
  await effectSession.playPhase("activation");
  await effectSession.playPhase("cast");

  const rollContext = buildRollContext({
    actor,
    token,
    item: source,
    roll: null,
    rollType: "utility",
    targets: resolvedTargets,
    options: { dealsDamage: false },
  });
  const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {};
  const rollMode = globalThis.game?.settings?.get?.("core", "rollMode") ?? "publicroll";
  const targetNames = resolvedTargets
    .map((target) => target?.name ?? target?.document?.name ?? target?.actor?.name)
    .filter(Boolean);
  const targetLine = targetNames.length ? `<p><strong>Targets:</strong> ${targetNames.map(escapeHtml).join(", ")}</p>` : "";
  const activation = source.system?.activation ?? {};
  const concentrationStatusActorUuids = [
    ...(activation.concentrationStatusIncludesSource && actor.uuid ? [actor.uuid] : []),
    ...resolvedTargets.map((target) => target?.actor?.uuid ?? target?.document?.actor?.uuid ?? null),
  ].filter(Boolean);
  const message = await globalThis.ChatMessage?.create?.({
    speaker,
    rollMode,
    flavor: escapeHtml(source.name),
    content: `<div class="marvel-multiverse utility-activation"><p>${escapeHtml(source.system?.description)}</p>${targetLine}<p>${escapeHtml(source.system?.effect)}</p></div>`,
    flags: {
      "marvel-multiverse": {
        rollContext,
        utilityActivation: {
          version: 1,
          targetCount: resolvedTargets.length,
          concentrationStatus: activation.concentrationStatus || null,
          concentrationStatusActorUuids,
        },
        actionFocus: focusSpend?.success ? {
          version: 1,
          actorUuid: actor.uuid ?? null,
          amount: focusCost,
          previousValue: focusSpend.previousValue,
          newValue: focusSpend.newValue,
        } : null,
        reactionContext,
        effectsPlayed: effectSession.getPlayedMetadata(),
      },
    },
  });

  if (message) {
    await updateChatMessageFlags(message, { "marvel-multiverse": { rollContext } });
    await autoEvaluatePowerEvents(message, { item: source, triggers: ["action-declared"] });
  }
  return { cancelled: false, message, roll: null };
}
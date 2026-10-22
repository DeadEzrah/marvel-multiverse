import { applyActorStatus } from "../conditions.mjs";

const endingSupportSources = new Set();

function getHealingSupport(effect) {
  return effect?.flags?.["marvel-multiverse"]?.healingSupport
    ?? effect?.flags?.marvelMultiverse?.healingSupport
    ?? null;
}

function getActorEffects(actor) {
  if (Array.isArray(actor?.effects?.contents)) return actor.effects.contents;
  if (actor?.effects && typeof actor.effects[Symbol.iterator] === "function") return [...actor.effects];
  return [];
}

function isAuthoritativeClient() {
  const user = globalThis.game?.user;
  const activeGM = globalThis.game?.users?.activeGM;
  if (activeGM) return activeGM.id === user?.id;
  return Boolean(user?.isGM);
}

function getResourceValue(actor, resource) {
  const value = actor?.system?.[resource]?.value;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function getHealingSupportRestriction(actor) {
  for (const effect of getActorEffects(actor)) {
    const support = getHealingSupport(effect);
    if (support?.movementOnly === true) {
      return {
        effectId: effect.id ?? effect._id ?? null,
        effectName: effect.name ?? "Healing support",
        kind: support.kind ?? null,
      };
    }
  }
  return null;
}

export function isHealingSupportFocusSpendBlocked(actor) {
  return getActorEffects(actor).some((effect) => getHealingSupport(effect)?.preventFocusSpend === true);
}

export async function handleHealingSupportResourceUpdate(actor) {
  if (!actor || !isAuthoritativeClient()) return { ended: 0 };
  let ended = 0;
  for (const effect of getActorEffects(actor)) {
    const support = getHealingSupport(effect);
    if (!support?.resource || support.endWhenAbove === undefined) continue;
    const value = getResourceValue(actor, support.resource);
    if (value === null || value <= Number(support.endWhenAbove)) continue;
    const sourceActor = typeof globalThis.fromUuidSync === "function"
      ? globalThis.fromUuidSync(support.sourceActorUuid)
      : null;
    if (!sourceActor || typeof globalThis.game?.marvelMultiverse?.endConcentration !== "function") continue;
    const sourceKey = sourceActor.uuid ?? support.sourceActorUuid;
    if (endingSupportSources.has(sourceKey)) continue;
    endingSupportSources.add(sourceKey);
    try {
      const result = await globalThis.game.marvelMultiverse.endConcentration(sourceActor, {
        reason: `${support.resource}-restored`,
      });
      if (result?.success) ended += 1;
    } finally {
      endingSupportSources.delete(sourceKey);
    }
  }
  return { ended };
}

export async function handleHealingSupportEffectDeleted(effect) {
  if (!effect || !isAuthoritativeClient()) return { applied: false };
  const support = getHealingSupport(effect);
  const actor = effect.parent;
  if (!support?.resource || !support.statusOnEnd || !actor) return { applied: false };
  const value = getResourceValue(actor, support.resource);
  if (value === null || value > Number(support.endWhenAbove ?? 0)) return { applied: false };
  const result = await applyActorStatus({
    actor,
    status: support.statusOnEnd,
    mode: "apply",
  });
  return { applied: Boolean(result?.success), result };
}

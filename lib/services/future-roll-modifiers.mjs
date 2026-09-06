function collectionToArray(collection) {
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (collection && typeof collection[Symbol.iterator] === "function") return [...collection];
  return [];
}

function getModifier(effect) {
  return effect?.flags?.["marvel-multiverse"]?.futureRollModifier ?? null;
}

export function resolveFutureRollModifiers(actor, context = {}) {
  const sourceItemUuid = context.source?.uuid ?? null;
  const targetActorUuids = new Set((context.targets ?? []).map((target) => target?.actorUuid ?? target?.actor?.uuid).filter(Boolean));
  return collectionToArray(actor?.effects)
    .filter((effect) => !effect?.disabled && !effect?.isSuppressed)
    .map((effect) => ({ effect, modifier: getModifier(effect) }))
    .filter(({ modifier }) => {
      if (!modifier || modifier.consumed) return false;
      if (modifier.sourceItemUuid && modifier.sourceItemUuid !== sourceItemUuid) return false;
      if (modifier.targetActorUuid && !targetActorUuids.has(modifier.targetActorUuid)) return false;
      return ["edge", "trouble"].includes(modifier.mode);
    })
    .map(({ effect, modifier }) => ({
      id: modifier.id ?? effect.id,
      effectId: effect.id,
      mode: modifier.mode,
      count: Number.isInteger(Number(modifier.count)) && Number(modifier.count) > 0 ? Number(modifier.count) : 1,
      label: modifier.label ?? effect.name ?? "Future roll modifier",
      selected: true,
    }));
}

export async function grantFutureRollModifier(actor, outcome, context = {}) {
  if (typeof actor?.createEmbeddedDocuments !== "function") {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "actor-unsupported" };
  }
  const mode = ["edge", "trouble"].includes(outcome?.mode) ? outcome.mode : null;
  const count = Number.isInteger(Number(outcome?.count)) && Number(outcome.count) > 0 ? Number(outcome.count) : 1;
  const sourceItemUuid = outcome?.sourceItemUuid ?? context.sourceItem?.uuid ?? null;
  const targetActorUuid = outcome?.targetActorUuid ?? context.targetActorUuid ?? null;
  if (!mode || !sourceItemUuid || (outcome?.matchTarget !== false && !targetActorUuid)) {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "modifier-context-invalid" };
  }

  const label = outcome.label ?? `${mode === "edge" ? "Edge" : "Trouble"} on next ${context.sourceItem?.name ?? "matching roll"}`;
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: label,
    img: context.sourceItem?.img ?? "icons/svg/aura.svg",
    origin: context.sourceItem?.uuid ?? null,
    flags: {
      "marvel-multiverse": {
        futureRollModifier: {
          id: outcome.id ?? `future-roll-${Date.now()}`,
          mode,
          count,
          label,
          sourceItemUuid,
          targetActorUuid: outcome.matchTarget === false ? null : targetActorUuid,
          grantedByMessageUuid: context.message?.uuid ?? context.message?.id ?? null,
        },
      },
    },
  }]);
  const createdEffectIds = created.map((effect) => effect.id).filter(Boolean);
  return {
    success: createdEffectIds.length > 0,
    createdEffectIds,
    removedEffectIds: [],
  };
}

export async function consumeFutureRollModifiers(actor, modifiers) {
  const effectIds = [...new Set((modifiers ?? []).filter((modifier) => modifier?.selected).map((modifier) => modifier.effectId).filter(Boolean))];
  if (!effectIds.length) return { success: true, consumedEffectIds: [], consumed: [] };
  if (typeof actor?.deleteEmbeddedDocuments !== "function") return { success: false, consumedEffectIds: [], consumed: [] };
  const consumed = effectIds.map((effectId) => {
    const effect = actor.effects?.get?.(effectId) ?? collectionToArray(actor.effects).find((entry) => entry?.id === effectId);
    if (!effect) return null;
    const effectData = typeof effect.toObject === "function" ? effect.toObject() : { ...effect };
    delete effectData._id;
    return { actorUuid: actor.uuid ?? null, effectData, restored: false };
  }).filter(Boolean);
  await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
  return { success: true, consumedEffectIds: effectIds, consumed };
}

export async function restoreFutureRollModifierSnapshots(entries) {
  const restoredEffectIds = [];
  for (const entry of entries ?? []) {
    if (entry?.restored || !entry?.actorUuid || !entry?.effectData) continue;
    const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(entry.actorUuid) : null;
    if (typeof actor?.createEmbeddedDocuments !== "function") continue;
    try {
      const created = await actor.createEmbeddedDocuments("ActiveEffect", [entry.effectData]);
      const createdEffectIds = created.map((effect) => effect.id).filter(Boolean);
      if (!createdEffectIds.length) continue;
      entry.restored = true;
      entry.restoredAt = Date.now();
      entry.restoredEffectIds = createdEffectIds;
      restoredEffectIds.push(...createdEffectIds);
    } catch (error) {
      console.warn("Marvel Multiverse | Could not restore a consumed future roll modifier.", error);
    }
  }
  return { success: restoredEffectIds.length > 0, restoredEffectIds };
}

export async function restoreConsumedFutureRollModifiers(message) {
  const entries = message?.getFlag?.("marvel-multiverse", "consumedFutureRollModifiers") ?? [];
  if (!Array.isArray(entries) || !entries.some((entry) => !entry?.restored)) {
    return { success: false, restoredEffectIds: [], reason: "nothing-to-restore" };
  }

  const result = await restoreFutureRollModifierSnapshots(entries);
  await message.update({ "flags.marvel-multiverse.consumedFutureRollModifiers": entries });
  return result;
}
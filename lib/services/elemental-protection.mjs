function getEffects(actor) {
  if (Array.isArray(actor?.effects?.contents)) return actor.effects.contents;
  if (Array.isArray(actor?.effects)) return actor.effects;
  if (actor?.effects && typeof actor.effects[Symbol.iterator] === "function") return Array.from(actor.effects);
  return [];
}

function getProtection(effect) {
  const config = effect?.flags?.["marvel-multiverse"]?.elementalControl;
  const threshold = Number(config?.protectionThreshold);
  if (effect?.disabled || !Number.isFinite(threshold) || threshold <= 0) return null;
  return { effect, threshold: Math.floor(threshold) };
}

export function resolveElementalProtection(actor, incomingDamage, damageType = "health") {
  const amount = Math.max(0, Math.floor(Number(incomingDamage) || 0));
  if (damageType !== "health" || amount <= 0) {
    return { active: false, incomingDamage: amount, absorbedDamage: 0, remainingDamage: amount, threshold: 0, destroyed: false };
  }
  const protections = getEffects(actor).map(getProtection).filter(Boolean).sort((left, right) => right.threshold - left.threshold);
  const protection = protections[0];
  if (!protection) {
    return { active: false, incomingDamage: amount, absorbedDamage: 0, remainingDamage: amount, threshold: 0, destroyed: false };
  }
  const absorbedDamage = Math.min(amount, protection.threshold);
  return {
    active: true,
    effect: protection.effect,
    effectId: protection.effect.id ?? protection.effect._id ?? null,
    incomingDamage: amount,
    absorbedDamage,
    remainingDamage: Math.max(0, amount - absorbedDamage),
    threshold: protection.threshold,
    destroyed: amount > protection.threshold,
  };
}

export async function applyElementalProtection(actor, incomingDamage, damageType = "health") {
  const result = resolveElementalProtection(actor, incomingDamage, damageType);
  if (!result.destroyed || !result.effectId || typeof actor?.deleteEmbeddedDocuments !== "function") return result;
  const removedEffectData = typeof result.effect?.toObject === "function"
    ? result.effect.toObject()
    : globalThis.foundry?.utils?.deepClone
      ? globalThis.foundry.utils.deepClone(result.effect)
      : JSON.parse(JSON.stringify(result.effect));
  const sourceActorUuid = result.effect?.flags?.["marvel-multiverse"]?.elementalControl?.sourceActorUuid;
  const sourceActor = sourceActorUuid && typeof globalThis.fromUuidSync === "function"
    ? globalThis.fromUuidSync(sourceActorUuid)
    : null;
  const endConcentration = globalThis.game?.marvelMultiverse?.endConcentration;
  if (sourceActor && typeof endConcentration === "function") {
    await endConcentration(sourceActor, { reason: "elemental-protection-breached" });
  } else {
    await actor.deleteEmbeddedDocuments("ActiveEffect", [result.effectId]);
  }
  return { ...result, removedEffectData };
}

export async function restoreElementalProtection(actor, protection) {
  const data = protection?.removedEffectData;
  if (!data || typeof actor?.createEmbeddedDocuments !== "function") return { restored: false };
  const effectData = structuredClone(data);
  delete effectData._id;
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  return { restored: Boolean(created?.length), effectId: created?.[0]?.id ?? null };
}

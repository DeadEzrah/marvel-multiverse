function getMessageFlag(message, key) {
  return message?.getFlag?.("marvel-multiverse", key) ?? message?.flags?.["marvel-multiverse"]?.[key] ?? null;
}

function getReactionRecords(message) {
  const eventTransactions = getMessageFlag(message, "resolution")?.eventTransactions ?? [];
  const damageApplications = getMessageFlag(message, "damageApplications") ?? [];
  return [...eventTransactions, ...damageApplications];
}

function sourceUsesWeapon(rollContext) {
  if (!rollContext?.itemUuid || typeof globalThis.fromUuidSync !== "function") return false;
  const item = globalThis.fromUuidSync(rollContext.itemUuid);
  return item?.type === "weapon" || item?.system?.powerSet === "Melee Weapons";
}

export function resolveReactionAllowance(actor, powerSet = null) {
  const normalizedPowerSet = String(powerSet ?? "").trim().toLowerCase();
  const effects = Array.from(actor?.effects?.contents ?? actor?.effects ?? []);
  const transferredEffects = Array.from(actor?.items?.contents ?? actor?.items ?? [])
    .flatMap((item) => Array.from(item?.effects?.contents ?? item?.effects ?? []).filter((effect) => effect?.transfer));
  const seen = new Set();
  const additional = [...effects, ...transferredEffects].reduce((total, effect) => {
    if (effect?.disabled || effect?.isSuppressed) return total;
    const key = `${effect?.origin ?? ""}:${effect?.id ?? effect?._id ?? effect?.name ?? ""}`;
    if (seen.has(key)) return total;
    seen.add(key);
    const allowance = effect?.flags?.["marvel-multiverse"]?.reactionAllowance;
    if (!allowance) return total;
    const allowancePowerSet = String(allowance.powerSet ?? "").trim().toLowerCase();
    if (normalizedPowerSet && allowancePowerSet && allowancePowerSet !== normalizedPowerSet) return total;
    const count = Number(allowance.count);
    return total + (Number.isInteger(count) && count > 0 ? count : 0);
  }, 0);
  return { base: 1, additional, total: 1 + additional, powerSet: powerSet ?? null };
}

export function resolveLatestReactionContext(actor, source, messages = globalThis.game?.messages) {
  const activation = source?.system?.activation ?? {};
  const reactionType = activation.reactionType;
  const supported = new Set([
    "incoming-physical-damage",
    "incoming-close-damage",
    "incoming-close-miss",
    "incoming-attack",
    "incoming-attack-miss",
    "outgoing-weapon-fantastic-damage",
  ]);
  if (!supported.has(reactionType) || !actor?.uuid) return null;

  const requiredStance = String(activation.requiredStance ?? "").trim().toLowerCase();
  if (requiredStance) {
    const hasStance = Array.from(actor.effects?.contents ?? actor.effects ?? []).some((effect) =>
      !effect?.disabled
      && !effect?.isSuppressed
      && String(effect?.flags?.["marvel-multiverse"]?.powerStance ?? "").trim().toLowerCase() === requiredStance);
    if (!hasStance) return null;
  }

  const entries = Array.from(messages?.contents ?? messages ?? []);
  const reservedMessages = new Set(entries.flatMap((message) => {
    const reaction = getMessageFlag(message, "reactionContext");
    if (!reaction?.sourceDamageMessageUuid) return [];
    const records = getReactionRecords(message);
    const active = records.length === 0 || records.some((record) => !record?.undone);
    return active ? [reaction.sourceDamageMessageUuid] : [];
  }));

  for (const message of entries.reverse()) {
    const messageUuid = message?.uuid ?? message?.id ?? null;
    if (!messageUuid || reservedMessages.has(messageUuid)) continue;
    const actionDamage = getMessageFlag(message, "actionDamage");
    const actionRoll = getMessageFlag(message, "actionRoll");
    const rollContext = getMessageFlag(message, "rollContext");

    if (reactionType === "outgoing-weapon-fantastic-damage") {
      const apply = actionDamage?.apply;
      const appliedDamage = Number(apply?.appliedDamage);
      if (actionDamage?.attackerUuid !== actor.uuid
        || actionRoll?.result?.isFantastic !== true
        || !apply?.success
        || apply?.undone
        || !Number.isFinite(appliedDamage)
        || appliedDamage < 1
        || !actionDamage?.targetUuid
        || !sourceUsesWeapon(rollContext)) continue;
      const targetUuid = rollContext?.targetUuids?.[0] ?? actionDamage.targetUuid;
      return {
        type: reactionType,
        sourceDamageMessageUuid: messageUuid,
        targetActorUuid: actionDamage.targetUuid,
        targetUuid,
        appliedDamage,
      };
    }

    if (reactionType === "incoming-close-miss") {
      const damageContext = getMessageFlag(message, "damageContext");
      const targetActorUuid = actionRoll?.request?.target?.actorUuid ?? rollContext?.targetUuids?.[0] ?? null;
      const hypotheticalDamage = Number(damageContext?.finalDamage ?? damageContext?.rawDamage);
      const requiresResponseDamage = source?.system?.attack !== true;
      if (rollContext?.attackKind !== "close"
        || targetActorUuid !== actor.uuid
        || actionRoll?.result?.isSuccess !== false
        || !rollContext?.actorUuid
        || (requiresResponseDamage && (!Number.isFinite(hypotheticalDamage) || hypotheticalDamage <= 0))) continue;
      const context = {
        type: reactionType,
        sourceDamageMessageUuid: messageUuid,
        targetActorUuid: rollContext.actorUuid,
      };
      if (Number.isFinite(hypotheticalDamage)) {
        context.responseDamage = Math.max(0, Math.floor(hypotheticalDamage / 2));
        context.hypotheticalDamage = hypotheticalDamage;
      }
      if (rollContext.tokenUuid) context.targetUuid = rollContext.tokenUuid;
      return context;
    }

    if (reactionType === "incoming-attack") {
      const targetActorUuid = actionRoll?.request?.target?.actorUuid ?? rollContext?.targetUuids?.[0] ?? null;
      if (targetActorUuid !== actor.uuid || !rollContext?.actorUuid) continue;
      const context = {
        type: reactionType,
        sourceDamageMessageUuid: messageUuid,
        targetActorUuid: rollContext.actorUuid,
      };
      if (rollContext.tokenUuid) context.targetUuid = rollContext.tokenUuid;
      return context;
    }

    if (reactionType === "incoming-attack-miss") {
      const targetActorUuid = actionRoll?.request?.target?.actorUuid ?? rollContext?.targetUuids?.[0] ?? null;
      if (targetActorUuid !== actor.uuid
        || actionRoll?.result?.isSuccess !== false
        || !rollContext?.actorUuid) continue;
      const context = {
        type: reactionType,
        sourceDamageMessageUuid: messageUuid,
        targetActorUuid: rollContext.actorUuid,
      };
      if (rollContext.tokenUuid) context.targetUuid = rollContext.tokenUuid;
      return context;
    }

    if (actionDamage?.damage?.damageType !== "health") continue;
    if (reactionType === "incoming-physical-damage" && rollContext?.element) continue;
    if (reactionType === "incoming-close-damage" && rollContext?.attackKind !== "close") continue;
    const apply = actionDamage?.apply;
    if (!apply?.success || apply?.undone || actionDamage?.targetUuid !== actor.uuid) continue;
    const appliedDamage = Number(apply.appliedDamage);
    const previousValue = Number(apply.previousValue);
    if (!Number.isFinite(appliedDamage) || appliedDamage <= 0 || !Number.isFinite(previousValue)) continue;
    const context = {
      type: reactionType,
      sourceDamageMessageUuid: messageUuid,
      appliedDamage,
      previousValue,
      targetActorUuid: actor.uuid,
    };
    if (reactionType === "incoming-close-damage") {
      const baseDamage = Number(actionDamage?.damage?.baseDamage);
      if (!actionDamage?.attackerUuid || !Number.isFinite(baseDamage) || baseDamage <= 0) continue;
      context.targetActorUuid = actionDamage.attackerUuid;
      if (rollContext?.tokenUuid) context.targetUuid = rollContext.tokenUuid;
      context.responseDamage = Math.floor(baseDamage / 2);
    }
    return context;
  }
  return null;
}

export function resolveReactionTarget(reactionContext) {
  const uuid = reactionContext?.targetUuid ?? reactionContext?.targetActorUuid;
  if (!uuid || typeof globalThis.fromUuidSync !== "function") return null;
  const resolved = globalThis.fromUuidSync(uuid);
  const actor = resolved?.actor ?? resolved;
  if (!actor) return null;
  return {
    actor,
    actorUuid: actor.uuid ?? reactionContext.targetActorUuid,
    raw: resolved?.document ?? resolved,
    uuid: resolved?.uuid ?? actor.uuid ?? uuid,
    name: actor.name ?? resolved?.name ?? "Reaction target",
  };
}

function getMessageFlag(message, key) {
  return message?.getFlag?.("marvel-multiverse", key)
    ?? message?.flags?.["marvel-multiverse"]?.[key]
    ?? null;
}

function collectionToArray(collection) {
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (collection && typeof collection[Symbol.iterator] === "function") return [...collection];
  return [];
}

export function resolveActiveCombat(combat = null) {
  const combats = collectionToArray(globalThis.game?.combats);
  return combat
    ?? globalThis.game?.combats?.active
    ?? combats.find((entry) => entry?.active)
    ?? (globalThis.game?.combat?.active ? globalThis.game.combat : null)
    ?? null;
}

export function resolveActiveCombatContext(combat = null) {
  const resolved = resolveActiveCombat(combat);
  const round = Number(resolved?.round);
  if (!resolved?.id || !Number.isFinite(round)) return null;
  return {
    combatId: resolved.id,
    round,
  };
}

export function resolveOncePerRoundTargetActorUuids(actor, source, options = {}) {
  if (source?.system?.targeting?.oncePerRound !== true || !actor?.uuid || !source?.uuid) return new Set();
  const combatContext = options.combatContext ?? resolveActiveCombatContext(options.combat);
  if (!combatContext) return new Set();

  const excluded = new Set();
  const messages = collectionToArray(options.messages ?? globalThis.game?.messages);
  for (const message of messages) {
    const rollContext = getMessageFlag(message, "rollContext");
    if (rollContext?.actorUuid !== actor.uuid
      || rollContext?.itemUuid !== source.uuid
      || rollContext?.combatContext?.combatId !== combatContext.combatId
      || Number(rollContext?.combatContext?.round) !== combatContext.round) continue;

    const applications = getMessageFlag(message, "damageApplications");
    for (const application of Array.isArray(applications) ? applications : []) {
      if (application?.undone || application?.source !== "action-roll") continue;
      for (const target of Array.isArray(application.targets) ? application.targets : []) {
        if (target?.success && target.actorUuid) excluded.add(target.actorUuid);
      }
    }
  }
  return excluded;
}

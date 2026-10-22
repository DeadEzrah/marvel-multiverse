function collectionToArray(collection) {
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (collection && typeof collection[Symbol.iterator] === "function") return [...collection];
  return [];
}

function activeEffects(actor) {
  const actorEffects = collectionToArray(actor?.effects);
  const transferredEffects = collectionToArray(actor?.items)
    .flatMap((item) => collectionToArray(item?.effects).filter((effect) => effect?.transfer));
  return [...actorEffects, ...transferredEffects]
    .filter((effect) => !effect?.disabled && !effect?.isSuppressed);
}

export function getActorPhasingState(actor) {
  for (const effect of activeEffects(actor)) {
    const phasing = effect?.flags?.["marvel-multiverse"]?.phasing;
    if (phasing?.state === "intangible") return phasing;
  }
  return null;
}

export function isPhysicalPhasingAction(source) {
  const system = source?.system ?? source ?? {};
  if (typeof system.phasing?.physical === "boolean") return system.phasing.physical;
  if (!system.attack && !system.attackTarget && !system.damage?.enabled) return false;
  return ["mle", "agl"].includes(String(system.ability ?? "").toLowerCase());
}

export function evaluatePhasingInteraction(sourceActor, targets, source) {
  const sourceSystem = source?.system ?? source ?? {};
  if (!isPhysicalPhasingAction(source) || sourceSystem.phasing?.canCrossBoundary === true) {
    return { success: true, failures: [] };
  }

  const sourceIsPhased = Boolean(getActorPhasingState(sourceActor));
  const failures = [];
  for (const target of targets ?? []) {
    const targetActor = target?.actor ?? target;
    if (!targetActor) continue;
    const targetIsPhased = Boolean(getActorPhasingState(targetActor));
    if (sourceIsPhased === targetIsPhased) continue;
    const targetName = targetActor.name ?? target?.name ?? "Target";
    failures.push({
      targetActorUuid: targetActor.uuid ?? null,
      targetName,
      message: sourceIsPhased
        ? `${sourceActor?.name ?? "The character"} cannot physically affect ${targetName} while phased.`
        : `${targetName} cannot be physically affected while phased.`,
    });
  }
  return { success: failures.length === 0, failures };
}

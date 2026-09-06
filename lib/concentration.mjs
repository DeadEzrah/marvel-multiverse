const CONCENTRATION_VERSION = 1;
const CONCENTRATION_STATUS_KEY = "concentrating";

function getConcentrationFlags(actor) {
  const flags = actor?.flags?.["marvel-multiverse"] ?? actor?.flags?.marvelMultiverse ?? {};
  return flags.concentration ?? {};
}

async function writeConcentrationFlags(actor, state) {
  const payload = {
    flags: {
      "marvel-multiverse": {
        concentration: state,
      },
    },
  };

  if (typeof actor?.update === "function") {
    await actor.update(payload);
  } else {
    actor.flags = {
      ...(actor.flags ?? {}),
      "marvel-multiverse": {
        ...(actor.flags?.["marvel-multiverse"] ?? actor.flags?.marvelMultiverse ?? {}),
        concentration: state,
      },
    };
  }

  return state;
}

function isConcentrationMarker(effect) {
  const flags = effect?.flags?.["marvel-multiverse"] ?? effect?.flags?.marvelMultiverse ?? {};
  return Boolean(flags.concentrationMarker || effect?.statuses?.includes?.(CONCENTRATION_STATUS_KEY));
}

function getEffectId(effect) {
  return effect?.id ?? effect?._id ?? null;
}

async function removeConcentrationEffect(actor, effectId) {
  if (!effectId) return false;
  if (typeof actor?.deleteEmbeddedDocuments === "function") {
    await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
    return true;
  }
  if (Array.isArray(actor?.effects?.contents)) {
    actor.effects.contents = actor.effects.contents.filter((effect) => getEffectId(effect) !== effectId);
    return true;
  }
  return false;
}

async function removeConcentrationRegions(regionUuids, retainedRegionUuids = []) {
  const retained = new Set(retainedRegionUuids);
  for (const regionUuid of Array.isArray(regionUuids) ? regionUuids : []) {
    if (!regionUuid || retained.has(regionUuid)) continue;
    if (typeof globalThis.Sequencer?.EffectManager?.endEffects === "function") {
      await globalThis.Sequencer.EffectManager.endEffects({ origin: regionUuid });
    }
    const region = typeof globalThis.fromUuid === "function" ? await globalThis.fromUuid(regionUuid) : null;
    if (typeof region?.delete === "function") await region.delete();
  }
}

function getEffectLabel(effect) {
  if (typeof effect?.name === "string" && effect.name.trim()) return effect.name.trim();
  return "Concentrating";
}

export async function startConcentration(actor, options = {}) {
  if (!actor) return { success: false, issues: [{ code: "CONCENTRATION_NO_ACTOR", message: "No actor was provided." }] };

  const currentState = getConcentrationFlags(actor) ?? {};
  const effectId = currentState?.effectId ?? null;
  if (effectId) {
    await removeConcentrationEffect(actor, effectId);
  }
  const regionUuids = Array.isArray(options.regionUuids) ? options.regionUuids : [];
  await removeConcentrationRegions(currentState.regionUuids, regionUuids);

  const effectData = {
    name: options.itemName ? `Concentrating: ${options.itemName}` : "Concentrating",
    img: options.img ?? "icons/svg/aura.svg",
    statuses: [CONCENTRATION_STATUS_KEY],
    flags: {
      "marvel-multiverse": {
        concentrationMarker: true,
        concentration: {
          itemUuid: options.itemUuid ?? null,
          itemName: options.itemName ?? null,
          targetUuids: Array.isArray(options.targetUuids) ? options.targetUuids : [],
          statusTransactionIds: Array.isArray(options.statusTransactionIds) ? options.statusTransactionIds : [],
          regionUuids,
          messageUuid: options.message?.uuid ?? options.message?.id ?? null,
          source: options.source ?? null,
        },
      },
    },
    origin: actor?.uuid ?? null,
  };

  const createdEffects = typeof actor?.createEmbeddedDocuments === "function"
    ? await actor.createEmbeddedDocuments("ActiveEffect", [effectData])
    : [];

  const effect = createdEffects?.[0] ?? null;
  const nextState = {
    active: true,
    version: CONCENTRATION_VERSION,
    effectId: getEffectId(effect),
    startedAt: Date.now(),
    itemUuid: options.itemUuid ?? currentState.itemUuid ?? null,
    itemName: options.itemName ?? currentState.itemName ?? null,
    targetUuids: Array.isArray(options.targetUuids) ? [...options.targetUuids] : Array.isArray(currentState.targetUuids) ? [...currentState.targetUuids] : [],
    statusTransactionIds: Array.isArray(options.statusTransactionIds) ? [...options.statusTransactionIds] : Array.isArray(currentState.statusTransactionIds) ? [...currentState.statusTransactionIds] : [],
    regionUuids: [...regionUuids],
    messageUuid: options.message?.uuid ?? options.message?.id ?? currentState.messageUuid ?? null,
    source: options.source ?? currentState.source ?? null,
    history: Array.isArray(currentState.history) ? [...currentState.history] : [],
  };

  await writeConcentrationFlags(actor, nextState);
  Hooks.callAll("marvel-multiverse.concentrationStarted", actor, options);
  return { success: true, effectId: nextState.effectId, state: nextState };
}

export async function endConcentration(actor, options = {}) {
  if (!actor) return { success: false, issues: [{ code: "CONCENTRATION_NO_ACTOR", message: "No actor was provided." }] };

  const currentState = getConcentrationFlags(actor) ?? {};
  const entry = {
    endedAt: Date.now(),
    reason: options.reason ?? null,
    itemName: currentState.itemName ?? null,
    itemUuid: currentState.itemUuid ?? null,
  };

  const history = Array.isArray(currentState.history) ? [...currentState.history] : [];
  if (currentState.active) history.push(entry);

  const nextState = {
    ...currentState,
    active: null,
    endedAt: Date.now(),
    endedReason: options.reason ?? null,
    history,
    effectId: null,
    regionUuids: [],
  };

  if (currentState.effectId) {
    await removeConcentrationEffect(actor, currentState.effectId);
  }
  await removeConcentrationRegions(currentState.regionUuids);

  await writeConcentrationFlags(actor, nextState);
  Hooks.callAll("marvel-multiverse.concentrationEnded", actor, options);
  return { success: true, state: nextState };
}

export function prepareActorStatusDisplay(actor) {
  const effects = actor?.allApplicableEffects?.() ?? actor?.effects?.contents ?? [];
  const effectEntries = Array.isArray(effects) ? effects : [...effects];
  const statuses = [];
  const otherEffects = [];
  const concentrationState = getConcentrationFlags(actor) ?? {};

  for (const effect of effectEntries) {
    if (!effect) continue;
    if (isConcentrationMarker(effect)) continue;
    if (effect.disabled) continue;

    const entry = {
      id: getEffectId(effect),
      name: getEffectLabel(effect),
      img: effect.img ?? null,
      sourceName: effect.sourceName ?? effect.parent?.name ?? null,
      statuses: Array.isArray(effect.statuses) ? effect.statuses : [],
      isTemporary: Boolean(effect.isTemporary),
      durationLabel: effect.duration?.label ?? null,
    };

    if (entry.statuses.length) statuses.push(entry);
    else otherEffects.push(entry);
  }

  return {
    statuses,
    otherEffects,
    concentration: {
      active: Boolean(concentrationState.active),
      itemName: concentrationState.itemName ?? null,
      itemUuid: concentrationState.itemUuid ?? null,
      startedAt: concentrationState.startedAt ?? null,
      targetUuids: Array.isArray(concentrationState.targetUuids) ? concentrationState.targetUuids : [],
      statusTransactionIds: Array.isArray(concentrationState.statusTransactionIds) ? concentrationState.statusTransactionIds : [],
      regionUuids: Array.isArray(concentrationState.regionUuids) ? concentrationState.regionUuids : [],
    },
  };
}

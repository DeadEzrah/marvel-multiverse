import { getActorPhasingState } from "./phasing-interaction.mjs";

const PHASE_ALPHA = 0.62;
const PHASE_TINT = "#8fdfff";

function collectionToArray(collection) {
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (collection && typeof collection[Symbol.iterator] === "function") return [...collection];
  return [];
}

function getPhasingEffects(actor, removedEffectId = null) {
  return collectionToArray(actor?.effects).filter((effect) => {
    const effectId = effect?.id ?? effect?._id;
    return effectId !== removedEffectId
      && !effect?.disabled
      && !effect?.isSuppressed
      && effect?.flags?.["marvel-multiverse"]?.phasing?.state === "intangible";
  });
}

function resolveTokenDocuments(actor, suppliedTokens) {
  if (suppliedTokens) {
    return collectionToArray(suppliedTokens)
      .map((token) => token?.document ?? token)
      .filter((token) => typeof token?.update === "function");
  }
  const activeTokens = collectionToArray(actor?.getActiveTokens?.(true));
  const canvasTokens = collectionToArray(globalThis.canvas?.tokens?.placeables)
    .filter((token) => token?.actor === actor
      || token?.actor?.id === actor?.id
      || token?.document?.actorId === actor?.id);
  return [...new Set([...activeTokens, ...canvasTokens])]
    .map((token) => token?.document ?? token)
    .filter((token) => typeof token?.update === "function");
}

function isVisualCoordinator(force) {
  if (force) return true;
  const activeGm = globalThis.game?.users?.activeGM;
  return !activeGm || activeGm.id === globalThis.game?.user?.id;
}

function serializeTint(tint) {
  if (tint === null || tint === undefined) return null;
  return String(tint);
}

function buildVisualFlagDeletion() {
  const ForcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
  return typeof ForcedDeletion === "function"
    ? { "flags.marvel-multiverse.phasingVisual": new ForcedDeletion() }
    : { "flags.marvel-multiverse.-=phasingVisual": null };
}

async function playPersistentAura(effect, token) {
  if (!effect?.uuid || !token?.object || typeof globalThis.game?.marvelMultiverse?.playEffect !== "function") return;
  let enabled = false;
  try {
    enabled = globalThis.game?.settings?.get?.("marvel-multiverse", "enableSequencerEffects") === true;
  } catch {
    enabled = false;
  }
  if (!enabled) return;
  await globalThis.Sequencer?.EffectManager?.endEffects?.({ origin: effect.uuid, object: token.object });
  await globalThis.game.marvelMultiverse.playEffect("phasing.aura", {
    location: token.object,
    origin: effect.uuid,
    name: `Marvel Multiverse Phasing ${effect.uuid} ${token.uuid ?? token.id ?? ""}`,
    persist: true,
    override: {
      opacity: 0.35,
      scale: 1.15,
    },
  });
}

export async function synchronizeActorPhasingVisual(actor, options = {}) {
  if (!actor || !isVisualCoordinator(options.force)) return { success: false, reason: "not-coordinator", updated: 0 };

  const effects = getPhasingEffects(actor, options.removedEffectId);
  const phased = effects.length > 0 || Boolean(getActorPhasingState({
    ...actor,
    effects: effects,
  }));
  const tokens = resolveTokenDocuments(actor, options.tokens);
  let updated = 0;

  for (const token of tokens) {
    const stored = token.flags?.["marvel-multiverse"]?.phasingVisual;
    if (phased) {
      if (!stored) {
        await token.update({
          alpha: PHASE_ALPHA,
          "texture.tint": PHASE_TINT,
          "flags.marvel-multiverse.phasingVisual": {
            previousAlpha: Number.isFinite(Number(token.alpha)) ? Number(token.alpha) : 1,
            previousTint: serializeTint(token.texture?.tint),
          },
        });
        updated += 1;
      }
      for (const effect of effects) await playPersistentAura(effect, token);
    } else if (stored) {
      await token.update({
        alpha: Number.isFinite(Number(stored.previousAlpha)) ? Number(stored.previousAlpha) : 1,
        "texture.tint": stored.previousTint ?? null,
        ...buildVisualFlagDeletion(),
      });
      updated += 1;
    }
  }

  if (options.removedEffectUuid) {
    await globalThis.Sequencer?.EffectManager?.endEffects?.({ origin: options.removedEffectUuid });
  }
  return { success: true, phased, updated };
}

export function handlePhasingEffectCreated(effect) {
  if (effect?.flags?.["marvel-multiverse"]?.phasing?.state !== "intangible") return Promise.resolve(null);
  return synchronizeActorPhasingVisual(effect.parent);
}

export function handlePhasingEffectDeleted(effect) {
  if (effect?.flags?.["marvel-multiverse"]?.phasing?.state !== "intangible") return Promise.resolve(null);
  return synchronizeActorPhasingVisual(effect.parent, {
    removedEffectId: effect.id ?? effect._id,
    removedEffectUuid: effect.uuid,
  });
}

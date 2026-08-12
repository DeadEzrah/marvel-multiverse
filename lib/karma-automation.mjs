import { updateChatMessageFlags } from "./chat-message-state.mjs";
import { hasActorMutationPermission } from "./services/mutation-preflight.mjs";

const KARMA_RECOVERY_VERSION = 1;
const RECOVERY_CONFIG = Object.freeze({
  health: { ability: "res", label: "Health" },
  focus: { ability: "vig", label: "Focus" },
});

function createIssue(code, message) {
  return { severity: "error", code, message };
}

function localize(key, fallback) {
  const value = globalThis.game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

function getActiveMarvelDieValue(roll) {
  const die = roll?.dice?.[1];
  const active = die?.results?.find((result) => result?.active !== false && !result?.discarded);
  const raw = Number(active?.result ?? die?.result);
  if (!Number.isFinite(raw)) return null;
  return raw === 1 ? 6 : raw;
}

async function updateActor(actor, values) {
  await actor.update({ system: values });
}

export async function recoverWithKarma(actor, resource, options = {}) {
  const config = RECOVERY_CONFIG[resource] ?? null;
  if (!config) return { success: false, issues: [createIssue("KARMA_RESOURCE_INVALID", "Choose Health or Focus recovery.")] };
  if (!actor || typeof actor.update !== "function") {
    return { success: false, issues: [createIssue("ACTOR_MISSING", "The recovering actor could not be resolved.")] };
  }
  if (!hasActorMutationPermission(actor)) {
    return { success: false, issues: [createIssue("PERMISSION_DENIED", "You do not have permission to spend this actor's Karma.")] };
  }

  const karma = actor.system?.karma ?? {};
  const currentKarma = Number(karma.value);
  const currentResource = Number(actor.system?.[resource]?.value);
  const maximumResource = Number(actor.system?.[resource]?.max);
  const rank = Number(actor.system?.attributes?.rank?.value);
  const abilityValue = Number(actor.system?.abilities?.[config.ability]?.value);
  if (!Number.isFinite(currentKarma) || currentKarma < 1) {
    return { success: false, issues: [createIssue("INSUFFICIENT_KARMA", "This actor does not have enough Karma.")] };
  }
  if (![currentResource, maximumResource, rank, abilityValue].every(Number.isFinite)) {
    return { success: false, issues: [createIssue("KARMA_RECOVERY_DATA_INVALID", "The actor's recovery values are incomplete.")] };
  }
  if (currentResource >= maximumResource) {
    return { success: false, issues: [createIssue("RESOURCE_ALREADY_FULL", `${config.label} is already full.`)] };
  }

  const RollClass = globalThis.CONFIG?.Dice?.MarvelMultiverseRoll;
  if (typeof RollClass !== "function") {
    return { success: false, issues: [createIssue("ROLL_CLASS_MISSING", "The Marvel roll engine is unavailable.")] };
  }

  const previous = { karma: currentKarma, resource: currentResource };
  await updateActor(actor, { karma: { value: currentKarma - 1 } });

  try {
    const roll = new RollClass(`{1d6,1dm,1d6} + @abilities.${config.ability}.value`, actor.getRollData?.() ?? {}, {
      actionType: "karma-recovery",
      cardPresentation: "compact",
      edgeCount: 0,
      troubleCount: 0,
    });
    await roll.evaluate({});
    const total = Number(roll.total);
    const marvelDie = getActiveMarvelDieValue(roll);
    if (!Number.isFinite(total) || !Number.isFinite(marvelDie)) throw new Error("Karma recovery roll did not produce usable results.");

    const isFantastic = Boolean(roll.isFantastic);
    const checkSucceeded = total >= 10;
    const calculatedRecovery = checkSucceeded ? (marvelDie * rank + abilityValue) * (isFantastic ? 2 : 1) : 0;
    const newResource = Math.min(maximumResource, currentResource + calculatedRecovery);
    const appliedRecovery = newResource - currentResource;
    if (appliedRecovery > 0) await updateActor(actor, { [resource]: { value: newResource } });

    const outcome = isFantastic
      ? (checkSucceeded ? "Fantastic Success" : "Fantastic Failure")
      : (checkSucceeded ? "Success" : "Failure");
    const flavor = `${config.label} Recovery: ${outcome}${checkSucceeded ? ` (${appliedRecovery} ${config.label} recovered)` : ""}`;
    const message = await roll.toMessage(
      { speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {}, flavor, title: `${config.label} Recovery` },
      { actor, rollType: "ability", targets: [], dealsDamage: false, userId: globalThis.game?.user?.id },
    );
    if (!message) throw new Error("Karma recovery chat message could not be created.");

    const transaction = {
      version: KARMA_RECOVERY_VERSION,
      actorUuid: actor.uuid ?? null,
      resource,
      ability: config.ability,
      targetNumber: 10,
      karmaSpent: 1,
      previousKarma: currentKarma,
      newKarma: currentKarma - 1,
      previousValue: currentResource,
      newValue: newResource,
      appliedRecovery,
      rollTotal: total,
      marvelDie,
      isFantastic,
      checkSucceeded,
      karmaRerollAllowed: false,
    };
    await updateChatMessageFlags(message, { "marvel-multiverse": { karmaRecovery: transaction } });
    globalThis.Hooks?.callAll?.("marvel-multiverse.karmaRecovery", message, transaction);
    return { success: true, actor, message, roll, transaction, issues: [] };
  } catch (error) {
    await updateActor(actor, {
      karma: { value: previous.karma },
      [resource]: { value: previous.resource },
    });
    console.error("Marvel Multiverse | Karma recovery failed.", error);
    return { success: false, issues: [createIssue("KARMA_RECOVERY_FAILED", localize("MARVEL_MULTIVERSE.KarmaRecoveryFailed", "Karma recovery failed."))] };
  }
}
import {
  applyNormalization,
  normalizeCharacterData,
  normalizePowerData,
  previewNormalization,
} from "./normalization.mjs";
import { buildRollContext, getRollContext, hasRollContext } from "./roll-context.mjs";
import {
  compareAttackToStoredTargets,
  getAttackResolution,
  refreshAttackResolution,
} from "./attack-resolution.mjs";
import {
  buildDamageContext,
  calculateMarvelDamage,
  getDamageContext,
  refreshDamageContext,
} from "./damage-calculation.mjs";
import {
  getFocusTransactions,
  parseFocusCost,
  refundMessageFocus,
  spendMessageFocus,
} from "./focus-automation.mjs";
import {
  getEligibleEscapeTargets,
  markTargetEscaped,
  recordStatusTransaction,
  rollEscapeCheck,
} from "./escape-automation.mjs";
import {
  endConcentration,
  prepareActorStatusDisplay,
  startConcentration,
} from "./concentration.mjs";
import {
  logValidationResult,
  validateActiveEffect,
  validateCharacterActor,
  validateDocument,
  validateEmbeddedItem,
  validatePowerItem,
} from "./validation.mjs";
import {
  canPerformPositionalAction,
  getResolvedTargetActors,
  getResolvedTargetTokens,
  getStoredTargetUuids,
  resolveStoredTargets,
  resolveTargetUuid,
  resolveTargetUuids,
} from "./target-resolution.mjs";
import { createItemMacro as createHotbarMacro, shouldHandleHotbarDrop } from "./macros.mjs";
import {
  inspectActor,
  inspectCompendiums,
  inspectItem,
  inspectMessage,
} from "./rules-audit.mjs";
import {
  buildGuidedResolutionState,
  buildActionContext,
  inferWorkflowMode,
  isGuidedResolutionEnabled,
  openGuidedResolution,
  validateActionContext,
} from "./services/guided-resolution.mjs";
import {
  applyPowerOutcomes,
  autoEvaluatePowerEvents,
  evaluatePowerEvents,
  getPowerEvents,
  previewPowerOutcomes,
  sweepExpiredPowerEffects,
  sweepTurnBoundaryTriggers,
  undoPowerOutcomes,
  validatePowerEvents,
} from "./services/power-events.mjs";
import { getStoredMigrationVersion, needsMigration, runMigrations } from "./services/migration.mjs";
import { registerSocketRelay, requestAutoApplyDamage } from "./services/socket-relay.mjs";
import { requestRoll, getDefenseValue, resolveTargetingConfig } from "./services/action-roll.mjs";
import { importCompendiumContent, importCompendiumCsv, parseCompendiumImportCsv } from "./services/compendium-importer.mjs";
import { captureResourceDeltas, displayCapturedResourceDeltas } from "./services/resource-floater.mjs";
import { loadEffectLibrary } from "./services/effect-library.mjs";
import { createEffectProfileSession, normalizeEffectMetadata, resolveEffectPhaseProfile } from "./services/effect-profile-manager.mjs";
import { buildAreaRegionData, placePowerArea, resolveAreaTargetingConfig, resolveRegionTargets } from "./services/area-targeting.mjs";

let effectLibrary = null;

export async function initializeEffectLibrary(options = {}) {
  try {
    effectLibrary = await loadEffectLibrary(options);
  } catch (error) {
    effectLibrary = null;
    console.warn("Marvel Multiverse | Effect manifest could not be loaded.", error);
  }
  return effectLibrary;
}

// Public hook names fired via Hooks.callAll for macro authors/module integrations.
// Documented here (and exposed at game.marvelMultiverse.HOOKS) since Foundry has no
// built-in hook-discovery mechanism of its own.
export const HOOKS = Object.freeze({
  /** (message: ChatMessage, item: Item|null) - after an attack roll's hit/miss outcome is resolved against its stored targets. */
  ATTACK_RESOLVED: "marvel-multiverse.attackResolved",
  /** (roll: MarvelMultiverseRoll, roll: MarvelMultiverseRoll) - after an item's attack roll completes. */
  ROLL_ATTACK: "marvel-multiverse.rollAttack",
  /** (roll: MarvelMultiverseRoll, roll: MarvelMultiverseRoll) - after an item's damage-dealing roll completes. */
  CALC_DAMAGE: "marvel-multiverse.calcDamage",
  /** (message: ChatMessage, transaction: object, result: object) - after damage is applied to target actor(s). */
  DAMAGE_APPLIED: "marvel-multiverse.damageApplied",
  /** (message: ChatMessage, transaction: object, result: object) - after a prior damage application is undone. */
  DAMAGE_UNDONE: "marvel-multiverse.damageUndone",
  /** (actor: Actor, options: object) - after an actor begins concentrating on a power. */
  CONCENTRATION_STARTED: "marvel-multiverse.concentrationStarted",
  /** (actor: Actor, options: object) - after an actor's concentration ends. */
  CONCENTRATION_ENDED: "marvel-multiverse.concentrationEnded",
  /** (message: ChatMessage, message: ChatMessage, attempt: object, result: object) - after an escape check is rolled. */
  ESCAPE_ROLLED: "marvel-multiverse.escapeRolled",
  /** (message: ChatMessage, message: ChatMessage, attempt: object, result: object) - after a successful escape check. */
  ESCAPE_SUCCEEDED: "marvel-multiverse.escapeSucceeded",
  /** (message: ChatMessage, message: ChatMessage, attempt: object, result: object) - after a failed escape check. */
  ESCAPE_FAILED: "marvel-multiverse.escapeFailed",
  /** (message: ChatMessage, transaction: object, result: object) - after focus is spent for an action. */
  FOCUS_SPENT: "marvel-multiverse.focusSpent",
  /** (message: ChatMessage, transaction: object, result: object) - after previously spent focus is refunded. */
  FOCUS_REFUNDED: "marvel-multiverse.focusRefunded",
});

function applySystemApi(context) {
  if (!globalThis.game?.marvelMultiverse && globalThis.game?.MarvelMultiverse) {
    globalThis.game.marvelMultiverse = globalThis.game.MarvelMultiverse;
  }

  globalThis.game.marvelMultiverse = globalThis.game.marvelMultiverse ?? {};
  const api = globalThis.game.marvelMultiverse;
  api.HOOKS = HOOKS;
  api.getStoredMigrationVersion = () => getStoredMigrationVersion();
  api.needsMigration = (currentVersion) => needsMigration(currentVersion);
  api.buildActionContext = (options = {}) => buildActionContext(options);
  api.validateActionContext = (context) => validateActionContext(context);
  api.inferWorkflowMode = (context = {}) => inferWorkflowMode(context);
  api.buildGuidedResolutionState = (context = {}, selection = {}) => buildGuidedResolutionState(context, selection);
  api.isGuidedResolutionEnabled = () => isGuidedResolutionEnabled();
  api.openGuidedResolution = (options = {}) => openGuidedResolution(options);
  api.requestRoll = (options = {}) => requestRoll(options);
  api.getDefenseValue = (actor, defenseType) => getDefenseValue(actor, defenseType);
  api.resolveTargetingConfig = (item, options = {}) => resolveTargetingConfig(item, options);
  api.resolveAreaTargetingConfig = (source) => resolveAreaTargetingConfig(source);
  api.buildAreaRegionData = (config, options = {}) => buildAreaRegionData(config, options);
  api.resolveRegionTargets = (region, tokens, options = {}) => resolveRegionTargets(region, tokens, options);
  api.placePowerArea = (source, options = {}) => placePowerArea(source, options);
  api.effects = effectLibrary;
  api.getSound = (profileId) => effectLibrary?.getSound(profileId) ?? null;
  api.getAnimation = (profileId) => effectLibrary?.getAnimation(profileId) ?? null;
  api.getEffect = (profileId) => effectLibrary?.getEffect(profileId) ?? { profileId: null, sound: null, animation: null };
  api.getDocumentEffect = (document, phase = "default") => effectLibrary?.getDocumentEffect(document, phase) ?? { profileId: null, sound: null, animation: null };
  api.playEffect = (profileId, options = {}) => effectLibrary?.playEffect(profileId, options) ?? Promise.resolve({ success: false, reason: "library-unavailable", profileId: null });
  api.playDocumentEffect = (document, phase = "default", options = {}) => effectLibrary?.playDocumentEffect(document, phase, options) ?? Promise.resolve({ success: false, reason: "library-unavailable", profileId: null });
  api.normalizeEffectMetadata = (source, options = {}) => normalizeEffectMetadata(source, options);
  api.resolveEffectPhaseProfile = (source, phase, options = {}) => resolveEffectPhaseProfile(source, phase, options);
  api.createEffectProfileSession = (source, context = {}, options = {}) => createEffectProfileSession(source, context, { library: effectLibrary, ...options });
  if (!globalThis.game.user?.isGM) return api;


  api.validateActor = (actor, options = {}) => {
    const result = validateCharacterActor(actor, options);
    logValidationResult(result, `Marvel Multiverse Validation: ${actor?.name || "Actor"}`);
    return result;
  };
  api.validateItem = (item, options = {}) => {
    const result = validatePowerItem(item, options);
    logValidationResult(result, `Marvel Multiverse Validation: ${item?.name || "Item"}`);
    return result;
  };
  api.validateDocument = (document, options = {}) => {
    const result = validateDocument(document, options);
    logValidationResult(result, `Marvel Multiverse Validation: ${document?.name || "Document"}`);
    return result;
  };
  api.validateCurrentActor = (options = {}) => {
    const actor = globalThis.game.user?.character ?? globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? null;
    if (!actor) {
      globalThis.ui?.notifications?.warn?.("No actor is currently available for validation.");
      return null;
    }
    return api.validateActor(actor, options);
  };
  api.normalizePowerData = (data, options = {}) => normalizePowerData(data, options);
  api.normalizeActorData = (data, options = {}) => normalizeCharacterData(data, options);
  api.previewNormalization = (document, options = {}) => previewNormalization(document, options);
  api.applyNormalization = (document, options = {}) => applyNormalization(document, options);
  api.buildRollContext = (options = {}) => buildRollContext(options);
  api.getRollContext = (message) => getRollContext(message);
  api.hasRollContext = (message) => hasRollContext(message);
  api.calculateDamage = (input) => calculateMarvelDamage(input);
  api.buildDamageContext = (message, options = {}) => buildDamageContext(message, options);
  api.getDamageContext = (message) => getDamageContext(message);
  api.refreshDamageContext = (message, options = {}) => refreshDamageContext(message, options);
  api.compareAttackToStoredTargets = (message, options = {}) => compareAttackToStoredTargets(message, options);
  api.refreshAttackResolution = (message, options = {}) => refreshAttackResolution(message, options);
  api.getAttackResolution = (message) => getAttackResolution(message);
  api.getStoredTargetUuids = (message) => getStoredTargetUuids(message);
  api.resolveTargetUuid = (uuid, options = {}) => resolveTargetUuid(uuid, options);
  api.resolveTargetUuids = (targetUuids, options = {}) => resolveTargetUuids(targetUuids, options);
  api.resolveStoredTargets = (message, options = {}) => resolveStoredTargets(message, options);
  api.getResolvedTargetActors = (result) => getResolvedTargetActors(result);
  api.getResolvedTargetTokens = (result) => getResolvedTargetTokens(result);
  api.canPerformPositionalAction = (targetEntry) => canPerformPositionalAction(targetEntry);
  api.spendMessageFocus = (message, options = {}) => spendMessageFocus(message, options);
  api.refundMessageFocus = (message, options = {}) => refundMessageFocus(message, options);
  api.getFocusTransactions = (message) => getFocusTransactions(message);
  api.parseFocusCost = (costText) => parseFocusCost(costText);
  api.recordStatusTransaction = (message, data = {}) => recordStatusTransaction(message, data);
  api.getEligibleEscapeTargets = (message, statusTransactionId) => getEligibleEscapeTargets(message, statusTransactionId);
  api.rollEscapeCheck = (message, options = {}) => rollEscapeCheck(message, options);
  api.markTargetEscaped = (message, options = {}) => markTargetEscaped(message, options);
  api.startConcentration = (actor, options = {}) => startConcentration(actor, options);
  api.endConcentration = (actor, options = {}) => endConcentration(actor, options);
  api.prepareActorStatusDisplay = (actor) => prepareActorStatusDisplay(actor);
  api.getPowerEvents = (item) => getPowerEvents(item);
  api.validatePowerEvents = (events, options = {}) => validatePowerEvents(events, options);
  api.evaluatePowerEvents = (options = {}) => evaluatePowerEvents(options.message, options);
  api.previewPowerOutcomes = (options = {}) => previewPowerOutcomes(options.message, options);
  api.applyPowerOutcomes = (options = {}) => applyPowerOutcomes(options.message, options);
  api.undoPowerOutcomes = (message, options = {}) => undoPowerOutcomes(message, options);
  api.sweepTurnBoundaryTriggers = (combat, boundary, combatantId = null) => sweepTurnBoundaryTriggers(combat, boundary, combatantId);
  api.parseCompendiumImportCsv = (csvText) => parseCompendiumImportCsv(csvText);
  api.importCompendiumContent = (payload, options = {}) => importCompendiumContent(payload, options);
  api.importCompendiumCsv = (csvText, options = {}) => importCompendiumCsv(csvText, options);

  const rulesAuditEnabled =
    globalThis.game?.settings?.get?.("marvel-multiverse", "rulesAuditDebugging") ===
    true;
  if (rulesAuditEnabled) {
    api.rulesAudit = {
      inspectActor,
      inspectItem,
      inspectMessage,
      inspectCompendiums,
    };
  } else if (api.rulesAudit) {
    delete api.rulesAudit;
  }

  return api;
}

export function registerSystemApi(context) {
  const {
    initializeSystem,
    MARVEL_MULTIVERSE,
    ChatMessageMarvel,
    DocumentMarvelMultiverseRoll,
    DocumentMarvelMultiverseCombatant,
    DocumentMarvelMultiverseActor,
    DocumentMarvelMultiverseItem,
    DocumentMarvelMultiverseCharacter,
    DocumentMarvelMultiverseNPC,
    DocumentMarvelMultiverseWeapon,
    DocumentMarvelMultiverseTrait,
    DocumentMarvelMultiverseOrigin,
    DocumentMarvelMultiverseOccupation,
    DocumentMarvelMultiverseTag,
    DocumentMarvelMultiversePower,
    DocumentMarvelDie,
    CharacterSheetClass,
    ModernCharacterSheetClass,
    NPCSheetClass,
    ItemSheetClass,
    version,
    ASCII,
  } = context;

  Hooks.once("init", () => {
    return initializeSystem({
      MARVEL_MULTIVERSE,
      ChatMessageMarvel,
      DocumentMarvelMultiverseRoll,
      DocumentMarvelMultiverseCombatant,
      DocumentMarvelMultiverseActor,
      DocumentMarvelMultiverseItem,
      DocumentMarvelMultiverseCharacter,
      DocumentMarvelMultiverseNPC,
      DocumentMarvelMultiverseWeapon,
      DocumentMarvelMultiverseTrait,
      DocumentMarvelMultiverseOrigin,
      DocumentMarvelMultiverseOccupation,
      DocumentMarvelMultiverseTag,
      DocumentMarvelMultiversePower,
      DocumentMarvelDie,
      CharacterSheetClass,
      ModernCharacterSheetClass,
      NPCSheetClass,
      ItemSheetClass,
      version,
      ASCII,
    });
  });

  Hooks.once("ready", async () => {
    Hooks.on("hotbarDrop", (bar, data, slot) => {
      if (!shouldHandleHotbarDrop(data)) return true;
      void createHotbarMacro(data, slot);
      return false;
    });
    void runMigrations(version);
    await initializeEffectLibrary();
    applySystemApi(context);
  });

  applySystemApi(context);
}

// Opt-in (default off) zero-click cross-client damage application: when an attack resolves and
// the "Auto-Apply Damage on Hit" setting is enabled, relays a request (via socketlib when
// available, or applies directly if the current user is already the GM) instead of requiring
// someone to click the chat card's Apply Damage/Resolve Action button. Silently no-ops when
// neither path is available (no GM online and no socketlib) - this is a convenience feature,
// not a replacement for the existing manual buttons.
function maybeAutoApplyDamageOnHit(message) {
  if (globalThis.game?.settings?.get?.("marvel-multiverse", "autoApplyDamageOnHit") !== true) return;
  const rollContext = message?.getFlag?.("marvel-multiverse", "rollContext") ?? null;
  if (!rollContext?.dealsDamage && !rollContext?.damageType) return;
  void requestAutoApplyDamage(message.id);
}

export function registerSystemHooks(context) {
  const { ChatMessageMarvel } = context;
  registerSystemApi(context);

  Hooks.on("renderSettings", (app, html) => {
    const heading = document.createElement("div");
    heading.classList.add("mmrpg", "sidebar-heading");
    heading.innerHTML = `
      <h2 class='mmrpg-game-title'>${game.system.title}
        <ul class="links mmrpg-ul">
          <li>
            <a href="https://github.com/mjording/marvel-multiverse/releases/latest" target="_blank">
              Marvel Multiverse RPG
            </a>
          </li>
          <li>
            <a href="https://github.com/mjording/marvel-multiverse/issues" target="_blank">${game.i18n.localize("MARVEL_MULTIVERSE.Issues")}</a>
          </li>
          <li>
            <a href="https://github.com/mjording/marvel-multiverse/wiki" target="_blank">${game.i18n.localize("MARVEL_MULTIVERSE.Wiki")}</a>
          </li>
        </ul>
      </h2>
    `;
    const badge = document.createElement("div");
    badge.classList.add("mmrpg", "system-badge");
    badge.innerHTML = `
      <img src="systems/marvel-multiverse/ui/official/mmrpg-badge-32.webp" data-tooltip="${game.system.title}" alt="${game.system.title}">
      <span class="system-info">${game.system.version}</span>
    `;
    if (game.release.generation < 13) {
      const details = html[0].querySelector("#game-details");
      const pip = details.querySelector(".system-info .update");
      if (pip) {
        badge.querySelector(".system-info").insertAdjacentElement("beforeend", pip);
      }
      heading.insertAdjacentElement("afterend", badge);
      details.insertAdjacentElement("afterend", heading);
    } else {
      const infoSection = html.querySelector("section.info");
      infoSection.insertAdjacentElement("beforeend", heading);
    }
  });

  Hooks.on("renderChatLog", (app, html, data) => {
    if (typeof ChatMessageMarvel?.onRenderChatLog === "function") {
      ChatMessageMarvel.onRenderChatLog(html);
    }
  });

  Hooks.on("preUpdateActor", (actor, changes, options) => {
    captureResourceDeltas(actor, changes, options);
  });

  Hooks.on("updateActor", (actor, changes, options) => {
    displayCapturedResourceDeltas(actor, options);
  });

  // Registers the cross-client damage-apply RPC once socketlib itself has finished setting up.
  // A no-op if the socketlib module isn't installed/active - this hook simply never fires then.
  Hooks.once("socketlib.ready", () => {
    registerSocketRelay();
  });

  Hooks.once("diceSoNiceReady", (dice3d) => {
    dice3d.addDicePreset({
      type: "dm",
      labels: ["m", "2", "3", "4", "5", "6"],
      colorset: "red",
      system: "standard",
    });
    dice3d.addDicePreset({
      type: "d6",
      labels: ["1", "2", "3", "4", "5", "6"],
      colorset: "white",
      system: "standard",
    });
  });

  Hooks.on("marvel-multiverse.attackResolved", (message, item) => {
    void autoEvaluatePowerEvents(message, { item, triggers: ["after-roll", "source-success", "source-failure", "source-fantastic-success", "target-hit", "target-miss", "target-fantastic-hit", "damage-calculated"] });
    maybeAutoApplyDamageOnHit(message);
  });

  Hooks.on("marvel-multiverse.damageApplied", (message) => {
    void autoEvaluatePowerEvents(message, { triggers: ["damage-applied", "focus-damage-applied", "health-damage-applied"] });
  });

  Hooks.on("marvel-multiverse.escapeSucceeded", (message) => {
    void autoEvaluatePowerEvents(message, { triggers: ["escape-succeeded"] });
  });

  Hooks.on("marvel-multiverse.escapeFailed", (message) => {
    void autoEvaluatePowerEvents(message, { triggers: ["escape-failed"] });
  });

  Hooks.on("marvel-multiverse.concentrationStarted", (actor, options) => {
    if (options?.message) void autoEvaluatePowerEvents(options.message, { triggers: ["concentration-started"] });
  });

  Hooks.on("marvel-multiverse.concentrationEnded", (actor, options) => {
    if (options?.message) void autoEvaluatePowerEvents(options.message, { triggers: ["concentration-ended"] });
  });

  Hooks.on("updateCombat", (combat) => {
    void sweepExpiredPowerEffects(combat);
  });

  // Opt-in (enableTurnBasedTriggers world setting, default off): fires start/end-of-turn power
  // events for the combatant whose turn is starting, plus the combatant whose turn just ended
  // (combat.previous - the turn tracker's own record of the prior position, when available).
  Hooks.on("combatTurn", (combat) => {
    void sweepTurnBoundaryTriggers(combat, "start");
    const previousCombatantId = combat?.previous?.combatantId ?? null;
    if (previousCombatantId) void sweepTurnBoundaryTriggers(combat, "end", previousCombatantId);
  });
}


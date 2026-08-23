import { getCosmeticStatusEffects, getSystemStatusEffects } from "./conditions.mjs";
import { registerMigrationSetting } from "./services/migration.mjs";

export const preloadHandlebarsTemplates = async () =>
  loadTemplatesCompat([
    "systems/marvel-multiverse/templates/actor/parts/actor-biography.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-details.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-effects.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-items.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-occupation.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-origin.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-powers.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-tags.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-traits.hbs",
    "systems/marvel-multiverse/templates/actor/parts/actor-weapons.hbs",
    "systems/marvel-multiverse/templates/item/parts/item-effects.hbs",
  ]);

export function configureFonts() {
  Object.assign(CONFIG.fontDefinitions, {
    Roboto: {
      editor: true,
      fonts: [
        {
          urls: ["systems/marvel-multiverse/fonts/roboto/Roboto-Regular.woff2"],
        },
        {
          urls: ["systems/marvel-multiverse/fonts/roboto/Roboto-Bold.woff2"],
          weight: "bold",
        },
        {
          urls: ["systems/marvel-multiverse/fonts/roboto/Roboto-Italic.woff2"],
          style: "italic",
        },
        {
          urls: [
            "systems/marvel-multiverse/fonts/roboto/Roboto-BoldItalic.woff2",
          ],
          weight: "bold",
          style: "italic",
        },
      ],
    },
    "Roboto Condensed": {
      editor: true,
      fonts: [
        {
          urls: [
            "systems/marvel-multiverse/fonts/roboto-condensed/RobotoCondensed-Regular.woff2",
          ],
        },
        {
          urls: [
            "systems/marvel-multiverse/fonts/roboto-condensed/RobotoCondensed-Bold.woff2",
          ],
          weight: "bold",
        },
        {
          urls: [
            "systems/marvel-multiverse/fonts/roboto-condensed/RobotoCondensed-Italic.woff2",
          ],
          style: "italic",
        },
        {
          urls: [
            "systems/marvel-multiverse/fonts/roboto-condensed/RobotoCondensed-BoldItalic.woff2",
          ],
          weight: "bold",
          style: "italic",
        },
      ],
    },
    "Roboto Slab": {
      editor: true,
      fonts: [
        {
          urls: [
            "systems/marvel-multiverse/fonts/roboto-slab/RobotoSlab-Regular.ttf",
          ],
        },
        {
          urls: [
            "systems/marvel-multiverse/fonts/roboto-slab/RobotoSlab-Bold.ttf",
          ],
          weight: "bold",
        },
      ],
    },
  });
}

const loadTemplatesCompat = typeof foundry !== "undefined" && foundry?.applications?.handlebars?.loadTemplates
  ? foundry.applications.handlebars.loadTemplates
  : globalThis.loadTemplates;

function getActorSheetBase() {
  if (typeof foundry !== "undefined" && foundry?.appv1?.sheets?.ActorSheet) {
    return foundry.appv1.sheets.ActorSheet;
  }
  return globalThis.ActorSheet ?? class ActorSheetBase {};
}

function getItemSheetBase() {
  if (typeof foundry !== "undefined" && foundry?.appv1?.sheets?.ItemSheet) {
    return foundry.appv1.sheets.ItemSheet;
  }
  return globalThis.ItemSheet ?? class ItemSheetBase {};
}

function getActorsCollection() {
  if (typeof foundry !== "undefined" && foundry?.documents?.collections?.Actors) {
    return foundry.documents.collections.Actors;
  }
  return globalThis.Actors;
}

function getItemsCollection() {
  if (typeof foundry !== "undefined" && foundry?.documents?.collections?.Items) {
    return foundry.documents.collections.Items;
  }
  return globalThis.Items;
}

export function registerCoreConfig(context) {
  const {
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
  } = context;

  globalThis.MarvelMultiverse = game.MarvelMultiverse = Object.assign(
    game.system,
    globalThis.MarvelMultiverse
  );

  CONFIG.MARVEL_MULTIVERSE = MARVEL_MULTIVERSE;

  CONFIG.Combat.initiative = {
    formula: "{1d6,1dm,1d6} + @attributes.init.value",
    decimals: 2,
  };

  CONFIG.Actor.documentClass = DocumentMarvelMultiverseActor;
  CONFIG.Actor.dataModels = {
    character: DocumentMarvelMultiverseCharacter,
    npc: DocumentMarvelMultiverseNPC,
  };
  // Exposes health/focus/karma as selectable Token HUD/Config resource bars beyond the
  // two already covered by system.json's primaryTokenAttribute/secondaryTokenAttribute.
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["health", "focus", "karma"], value: [] },
    npc: { bar: ["health", "focus", "karma"], value: [] },
  };
  CONFIG.ChatMessage.documentClass = ChatMessageMarvel;
  CONFIG.Combatant.documentClass = DocumentMarvelMultiverseCombatant;
  CONFIG.Item.documentClass = DocumentMarvelMultiverseItem;
  CONFIG.Item.dataModels = {
    item: DocumentMarvelMultiverseItem,
    weapon: DocumentMarvelMultiverseWeapon,
    trait: DocumentMarvelMultiverseTrait,
    origin: DocumentMarvelMultiverseOrigin,
    occupation: DocumentMarvelMultiverseOccupation,
    tag: DocumentMarvelMultiverseTag,
    power: DocumentMarvelMultiversePower,
  };

  CONFIG.ActiveEffect.legacyTransferral = false;
  CONFIG.Dice.MarvelDie = DocumentMarvelDie;
  CONFIG.Dice.types.push(DocumentMarvelDie);

  // Register the system's official conditions plus visual-only markers as Token HUD status
  // effects, additive to core defaults (e.g. the "defeated" skull toggle) so neither set overrides
  // the other.
  if (Array.isArray(CONFIG.statusEffects)) {
    const existingIds = new Set(CONFIG.statusEffects.map((effect) => effect?.id));
    for (const effect of [...getSystemStatusEffects(), ...getCosmeticStatusEffects()]) {
      if (!existingIds.has(effect.id)) CONFIG.statusEffects.push(effect);
    }
  }
  CONFIG.specialStatusEffects = {
    ...CONFIG.specialStatusEffects,
    BLIND: "blinded",
    INVISIBLE: "invisible",
  };

  Roll.TOOLTIP_TEMPLATE = "systems/marvel-multiverse/templates/chat/roll-breakdown.hbs";
  Roll.CHAT_TEMPLATE = "systems/marvel-multiverse/templates/dice/roll.hbs";
  CONFIG.Dice.MarvelMultiverseRoll = DocumentMarvelMultiverseRoll;
  CONFIG.Dice.rolls.push(DocumentMarvelMultiverseRoll);
  CONFIG.Dice.terms.m = DocumentMarvelDie;

  configureFonts();
}

export function registerSystemSheets(context) {
  const { ModernCharacterSheetClass, NPCSheetClass, ItemSheetClass } = context;
  const ActorsCollection = getActorsCollection();
  const ItemsCollection = getItemsCollection();
  const ActorSheetBase = getActorSheetBase();
  const ItemSheetBase = getItemSheetBase();

  if (typeof ActorsCollection?.unregisterSheet === "function") {
    ActorsCollection.unregisterSheet("core", ActorSheetBase);
  }
  if (typeof ActorsCollection?.registerSheet === "function") {
    if (ModernCharacterSheetClass) {
      ActorsCollection.registerSheet("marvel-multiverse", ModernCharacterSheetClass, {
        types: ["character"],
        makeDefault: true,
        label: "MARVEL_MULTIVERSE.SheetLabels.Actor",
      });
    }
    ActorsCollection.registerSheet("marvel-multiverse", NPCSheetClass, {
      types: ["npc"],
      makeDefault: true,
      label: "MARVEL_MULTIVERSE.SheetLabels.NPC",
    });
  }
  if (typeof ItemsCollection?.unregisterSheet === "function") {
    ItemsCollection.unregisterSheet("core", ItemSheetBase);
  }
  if (typeof ItemsCollection?.registerSheet === "function") {
    ItemsCollection.registerSheet("marvel-multiverse", ItemSheetClass, {
      makeDefault: true,
      label: "MARVEL_MULTIVERSE.SheetLabels.Item",
    });
  }
}

export function registerAuditSettings() {
  if (!game?.settings?.register) return;

  const registerBoolean = (key, name, hint, defaultValue = false) => {
    game.settings.register("marvel-multiverse", key, {
      name,
      hint,
      scope: "world",
      config: true,
      type: Boolean,
      default: defaultValue,
    });
  };

  registerBoolean(
    "debug",
    "MARVEL_MULTIVERSE.Settings.Debug.Name",
    "MARVEL_MULTIVERSE.Settings.Debug.Hint"
  );
  registerBoolean(
    "rulesAuditDebugging",
    "MARVEL_MULTIVERSE.Settings.RulesAuditDebugging.Name",
    "MARVEL_MULTIVERSE.Settings.RulesAuditDebugging.Hint"
  );
  registerBoolean(
    "showRuleSourceReferences",
    "MARVEL_MULTIVERSE.Settings.ShowRuleSourceReferences.Name",
    "MARVEL_MULTIVERSE.Settings.ShowRuleSourceReferences.Hint"
  );
  registerBoolean(
    "warnOnUnverifiedAutomation",
    "MARVEL_MULTIVERSE.Settings.WarnOnUnverifiedAutomation.Name",
    "MARVEL_MULTIVERSE.Settings.WarnOnUnverifiedAutomation.Hint"
  );
  registerBoolean(
    "strictValidationMode",
    "MARVEL_MULTIVERSE.Settings.StrictValidationMode.Name",
    "MARVEL_MULTIVERSE.Settings.StrictValidationMode.Hint"
  );
  registerBoolean(
    "guidedResolutionEnabled",
    "MARVEL_MULTIVERSE.Settings.GuidedResolutionEnabled.Name",
    "MARVEL_MULTIVERSE.Settings.GuidedResolutionEnabled.Hint"
  );
  registerBoolean(
    "autoApplyDamageOnResolve",
    "MARVEL_MULTIVERSE.Settings.AutoApplyDamageOnResolve.Name",
    "MARVEL_MULTIVERSE.Settings.AutoApplyDamageOnResolve.Hint",
    true
  );
  registerBoolean(
    "autoApplyDamageOnHit",
    "MARVEL_MULTIVERSE.Settings.AutoApplyDamageOnHit.Name",
    "MARVEL_MULTIVERSE.Settings.AutoApplyDamageOnHit.Hint"
  );

  // Experimental automation toggles: each covers a rule that has no confirmed official ruling yet
  // (see docs/resolution-workflow/open-rule-questions.md and docs/research/CURRENT-SYSTEM-GAP-ANALYSIS.md).
  // All default OFF so no table is affected unless a GM explicitly opts in.
  registerBoolean(
    "enableOpposedCheckAutomation",
    "MARVEL_MULTIVERSE.Settings.EnableOpposedCheckAutomation.Name",
    "MARVEL_MULTIVERSE.Settings.EnableOpposedCheckAutomation.Hint"
  );
  registerBoolean(
    "enableTurnBasedTriggers",
    "MARVEL_MULTIVERSE.Settings.EnableTurnBasedTriggers.Name",
    "MARVEL_MULTIVERSE.Settings.EnableTurnBasedTriggers.Hint"
  );
  registerBoolean(
    "enableExperimentalPowerOutcomes",
    "MARVEL_MULTIVERSE.Settings.EnableExperimentalPowerOutcomes.Name",
    "MARVEL_MULTIVERSE.Settings.EnableExperimentalPowerOutcomes.Hint"
  );
  registerBoolean(
    "enableSequencerEffects",
    "MARVEL_MULTIVERSE.Settings.EnableSequencerEffects.Name",
    "MARVEL_MULTIVERSE.Settings.EnableSequencerEffects.Hint"
  );

  game.settings.register("marvel-multiverse", "actorSheetTheme", {
    name: "MARVEL_MULTIVERSE.Settings.ActorSheetTheme.Name",
    hint: "MARVEL_MULTIVERSE.Settings.ActorSheetTheme.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      standard: "MARVEL_MULTIVERSE.Settings.ActorSheetTheme.Standard",
      classicComic: "MARVEL_MULTIVERSE.Settings.ActorSheetTheme.ClassicComic",
    },
    default: "standard",
    onChange: () => {
      for (const actor of game.actors ?? []) actor.sheet?.render(false);
    },
  });
}

export async function initializeSystem(context) {
  const {
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

  console.log(
    `Marvel Multiverse RPG 1e | Initializing the Marvel Multiverse Role Playing Game System - Version  ${version}\n${ASCII}`
  );

  registerCoreConfig({
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
  });
  registerAuditSettings();
  registerMigrationSetting();
  registerSystemSheets({ CharacterSheetClass, ModernCharacterSheetClass, NPCSheetClass, ItemSheetClass });

  return preloadHandlebarsTemplates();
}

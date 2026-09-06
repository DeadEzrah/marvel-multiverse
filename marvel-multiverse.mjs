import {
  logValidationResult,
  resolvePowerSetCategory,
  validateActiveEffect,
  validateCharacterActor,
  validateDocument,
  validateEmbeddedItem,
  validatePowerItem,
} from "./lib/validation.mjs";
import {
  MarvelMultiverseRoll as DocumentMarvelMultiverseRoll,
  MarvelMultiverseCombatant as DocumentMarvelMultiverseCombatant,
  MarvelMultiverseActor as DocumentMarvelMultiverseActor,
  MarvelMultiverseItem as DocumentMarvelMultiverseItem,
  MarvelMultiverseActorBase as DocumentMarvelMultiverseActorBase,
  MarvelMultiverseCharacter as DocumentMarvelMultiverseCharacter,
  MarvelMultiverseNPC as DocumentMarvelMultiverseNPC,
  MarvelMultiverseItemBase as DocumentMarvelMultiverseItemBase,
  MarvelMultiverseWeapon as DocumentMarvelMultiverseWeapon,
  MarvelMultiverseOccupation as DocumentMarvelMultiverseOccupation,
  MarvelMultiverseOrigin as DocumentMarvelMultiverseOrigin,
  MarvelMultiverseTag as DocumentMarvelMultiverseTag,
  MarvelMultiverseTrait as DocumentMarvelMultiverseTrait,
  MarvelMultiversePower as DocumentMarvelMultiversePower,
  MarvelDie as DocumentMarvelDie,
  dice as documentDice,
  models as documentModels,
} from "./lib/documents.mjs";
import {
  applyNormalization,
  logNormalizationPreview,
  normalizeActorData,
  normalizeItemData,
  normalizePowerData,
  normalizeCharacterData,
  previewNormalization,
} from "./lib/normalization.mjs";
import {
  attachRollContext,
  buildRollContext,
  debugRollContext,
  getRollContext,
  hasRollContext,
  migrateLegacyRollContext,
} from "./lib/roll-context.mjs";
import {
  canPerformPositionalAction,
  getResolvedTargetActors,
  getResolvedTargetTokens,
  getStoredTargetUuids,
  resolveStoredTargets,
  resolveTargetUuid,
  resolveTargetUuids,
} from "./lib/target-resolution.mjs";
import {
  compareAttackToStoredTargets,
  getAttackResolution,
  refreshAttackResolution,
} from "./lib/attack-resolution.mjs";
import {
  getDamageApplications,
  hasAppliedMessageDamage,
} from "./lib/damage-application.mjs";
import {
  requestApplyMessageDamage,
  requestUndoMessageDamage,
} from "./lib/services/socket-relay.mjs";
import {
  buildDamageContext,
  calculateMarvelDamage,
  getDamageContext,
  refreshDamageContext,
} from "./lib/damage-calculation.mjs";
import {
  getFocusTransactions,
  parseFocusCost,
  refundMessageFocus,
  spendMessageFocus,
} from "./lib/focus-automation.mjs";
import {
  getEligibleEscapeTargets,
  getEscapeActionEntries,
  markTargetEscaped,
  recordStatusTransaction,
  rollEscapeCheck,
} from "./lib/escape-automation.mjs";
import {
  endConcentration,
  prepareActorStatusDisplay,
  startConcentration,
} from "./lib/concentration.mjs";
import {
  applyMessageConditions,
  getEligibleConditionTargetUuids,
  getConditionRollModifiers,
  getConditionApplications,
  getMessageConditions,
  undoMessageConditions,
} from "./lib/conditions.mjs";
import { updateChatMessageFlags } from "./lib/chat-message-state.mjs";
import {
  applyPowerOutcomes,
  getPowerEvents,
  previewPowerOutcomes,
  undoPowerOutcomes,
} from "./lib/services/power-events.mjs";
import { applyCheckDifficulty, applyOpposedCheck, getCheckResolution } from "./lib/check-resolution.mjs";
import {
  attachClickHandler,
  buildGuidedResolutionStepper,
  buildRollCardMeta,
  buildRollSummary,
  isCompactRollCard,
  hasDiceRoll,
  hydrateChatAutomationState,
  normalizeChatElement,
  resolveChatActionContainer,
} from "./lib/chat-card.mjs";
import { initializeSystem } from "./lib/bootstrap.mjs";
import { MarvelMultiverseCharacterSheet, MarvelMultiverseModernCharacterSheet, MarvelMultiverseComicCharacterSheet, MarvelMultiverseNPCSheet, MarvelMultiverseItemSheet } from "./lib/sheets.mjs";
import { registerSystemHooks } from "./lib/hooks.mjs";
import {
  getGuidedResolutionState,
  markGuidedResolutionApplied,
  markGuidedResolutionResolved,
  markGuidedResolutionUndone,
} from "./lib/services/guided-resolution.mjs";
import { promptDialog } from "./lib/services/dialog-compat.mjs";
import { restoreConsumedFutureRollModifiers } from "./lib/services/future-roll-modifiers.mjs";

const MARVEL_MULTIVERSE = {};
/**
 * The set of Ability Scores used within the system.
 * @type {Object}
 */
MARVEL_MULTIVERSE.abilities = {
  mle: "MARVEL_MULTIVERSE.Ability.Mel.long",
  agl: "MARVEL_MULTIVERSE.Ability.Agl.long",
  res: "MARVEL_MULTIVERSE.Ability.Res.long",
  vig: "MARVEL_MULTIVERSE.Ability.Vig.long",
  ego: "MARVEL_MULTIVERSE.Ability.Ego.long",
  log: "MARVEL_MULTIVERSE.Ability.Log.long",
};

MARVEL_MULTIVERSE.damageAbilityAbr = {
  Melee: "mle",
  Agility: "agl",
  Ego: "ego",
  Logic: "log",
};

MARVEL_MULTIVERSE.damageAbility = Object.fromEntries(
  Object.keys(MARVEL_MULTIVERSE.damageAbilityAbr).map((k) => [
    MARVEL_MULTIVERSE.damageAbilityAbr[k],
    k,
  ])
);

MARVEL_MULTIVERSE.MARVEL_RESULTS = {
  1: {
    label: "MARVEL_MULTIVERSE.MarvelResult.M",
    image: `systems/marvel-multiverse/icons/marvel-1.svg`,
  },
  2: {
    label: "MARVEL_MULTIVERSE.MarvelResult.2",
    image: `systems/marvel-multiverse/icons/marvel-2.svg`,
  },
  3: {
    label: "MARVEL_MULTIVERSE.MarvelResult.3",
    image: `systems/marvel-multiverse/icons/marvel-3.svg`,
  },
  4: {
    label: "MARVEL_MULTIVERSE.MarvelResult.4",
    image: `systems/marvel-multiverse/icons/marvel-4.svg`,
  },
  5: {
    label: "MARVEL_MULTIVERSE.MarvelResult.5",
    image: `systems/marvel-multiverse/icons/marvel-5.svg`,
  },
  6: {
    label: "MARVEL_MULTIVERSE.MarvelResult.6",
    image: `systems/marvel-multiverse/icons/marvel-6.svg`,
  },
};

MARVEL_MULTIVERSE.DICE_RESULTS = {
  1: {
    label: "MARVEL_MULTIVERSE.DiceResult.1",
    image: `systems/marvel-multiverse/icons/1.svg`,
  },
  2: {
    label: "MARVEL_MULTIVERSE.DiceResult.2",
    image: `systems/marvel-multiverse/icons/2.svg`,
  },
  3: {
    label: "MARVEL_MULTIVERSE.DiceResult.3",
    image: `systems/marvel-multiverse/icons/3.svg`,
  },
  4: {
    label: "MARVEL_MULTIVERSE.DiceResult.4",
    image: `systems/marvel-multiverse/icons/4.svg`,
  },
  5: {
    label: "MARVEL_MULTIVERSE.DiceResult.5",
    image: `systems/marvel-multiverse/icons/5.svg`,
  },
  6: {
    label: "MARVEL_MULTIVERSE.DiceResult.6",
    image: `systems/marvel-multiverse/icons/6.svg`,
  },
};

MARVEL_MULTIVERSE.sizes = {
  microscopic: {
    label: "MARVEL_MULTIVERSE.Size.Microscopic",
    sizeMultiplier: 0,
  },
  miniature: { label: "MARVEL_MULTIVERSE.Size.Miniature", sizeMultiplier: 0 },
  tiny: { label: "MARVEL_MULTIVERSE.Size.Tiny", sizeMultiplier: 0 },
  little: { label: "MARVEL_MULTIVERSE.Size.Little", sizeMultiplier: 0.25 },
  small: { label: "MARVEL_MULTIVERSE.Size.Small", sizeMultiplier: 0 },
  average: { label: "MARVEL_MULTIVERSE.Size.Average", sizeMultiplier: 0 },
  big: { label: "MARVEL_MULTIVERSE.Size.Big", sizeMultiplier: 0 },
  huge: { label: "MARVEL_MULTIVERSE.Size.Huge", sizeMultiplier: 5 },
  gigantic: { label: "MARVEL_MULTIVERSE.Size.Gigantic", sizeMultiplier: 20 },
  titanic: { label: "MARVEL_MULTIVERSE.Size.Titanic", sizeMultiplier: 80 },
  gargantuan: {
    label: "MARVEL_MULTIVERSE.Size.Gargantuan",
    sizeMultiplier: 320,
  },
};

MARVEL_MULTIVERSE.powersets = {
  basic: { label: "Basic" },
  elementalControl: { label: "Elemental Control" },
  healing: { label: "Healing" },
  illusion: { label: "Illusion" },
  luck: { label: "Luck" },
  magic: { label: "Magic" },
  martialArts: { label: "Martial Arts" },
  meleeWeapons: { label: "Melee Weapons" },
  narrative: { label: "Narrative" },
  omniversalTravel: { label: "Omniversal Travel" },
  phasing: { label: "Phasing" },
  plasticity: { label: "Plasticity" },
  powerControl: { label: "Power Control" },
  rangedWeapons: { label: "Ranged Weapons" },
  resize: { label: "Resize" },
  shieldBearer: { label: "Shield Bearer" },
  sixthSense: { label: "Sixth Sense" },
  spiderPowers: { label: "Spider-Powers" },
  superSpeed: { label: "Super-Speed" },
  superStrength: { label: "Super-Strength" },
  tactics: { label: "Tactics" },
  telekinesis: { label: "Telekinesis" },
  telepathy: { label: "Telepathy" },
  teleportation: { label: "Teleportation" },
  translation: { label: "Translation" },
  weatherControl: { label: "Weather Control" },
};

MARVEL_MULTIVERSE.reverseSetList = Object.fromEntries(
  Object.keys(MARVEL_MULTIVERSE.powersets).map((k) => [
    MARVEL_MULTIVERSE.powersets[k].label,
    k,
  ])
);

MARVEL_MULTIVERSE.movementTypes = {
  run: { label: "MARVEL_MULTIVERSE.Movement.Run", active: true },
  climb: { label: "MARVEL_MULTIVERSE.Movement.Climb", active: true },
  swim: { label: "MARVEL_MULTIVERSE.Movement.Swim", active: true },
  jump: { label: "MARVEL_MULTIVERSE.Movement.Jump", active: true },
  flight: { label: "MARVEL_MULTIVERSE.Movement.Flight", active: false },
  glide: { label: "MARVEL_MULTIVERSE.Movement.Glide", active: false },
  swingline: { label: "MARVEL_MULTIVERSE.Movement.Swingline", active: false },
  levitation: { label: "MARVEL_MULTIVERSE.Movement.Levitation", active: false },
};

MARVEL_MULTIVERSE.elements = {
  air: {
    label: "Air",
    fantasticEffect: "Target is knocked prone for one round.",
  },
  cold: { label: "Cold", fantasticEffect: "Paralyzes target for one round." },
  earth: {
    label: "Earth",
    fantasticEffect: "Target moves at half speed for one round.",
  },
  electricity: {
    label: "Electricity",
    fantasticEffect: "Stuns target for one round.",
  },
  energy: { label: "Energy", fantasticEffect: "Blinds target for one round." },
  fire: { label: "Fire", fantasticEffect: "Sets target ablaze." },
  force: {
    label: "Force",
    fantasticEffect: "Target has trouble on all actions for one round.",
  },
  hellfire: {
    label: "Hellfire",
    fantasticEffect: "Splits damage equally between Health and Focus.",
  },
  ice: { label: "Ice", fantasticEffect: "Paralyzes target for one round." },
  iron: { label: "Iron", fantasticEffect: "Pins target for one round." },
  light: { label: "Light", fantasticEffect: "Blinds target for one round." },
  sound: { label: "Sound", fantasticEffect: "Deafens target for one round." },
  water: {
    label: "Water",
    fantasticEffect: "Surprises target until the end of the next round.",
  },
  toxin: { label: "Toxin", fantasticEffect: "The target is poisoned." },
  chemical: { label: "Chemical", fantasticEffect: "The target is corroding." },
  swarm: { label: "Swarm", fantasticEffect: "The target is frightened." },
};

MARVEL_MULTIVERSE.teamManeuvers = [
  {
    maneuverType: "Offensive",
    levels: [
      {
        level: 1,
        cost: "5 focus, each",
        rankAvg: [1, 2],
        description:
          "The team members all get an edge on any attack they make this round.",
      },
      {
        level: 2,
        cost: "10 focus, each",
        rankAvg: [3, 4],
        description:
          "The team members can each reroll all their dice on any attack they make this round. They get to use the better result.",
      },
      {
        level: 3,
        cost: "15 focus, each",
        rankAvg: [5, 6],
        description:
          "The team members can each turn their Marvel die to a Fantastic success on any attack roll they make this round against targets of equal or highter rank.",
      },
    ],
  },
  {
    maneuverType: "Defensive",
    levels: [
      {
        level: 1,
        cost: "5 focus, each",
        rankAvg: [1, 2],
        description:
          "The team members all have Damage Reduction 2 for this round",
      },
      {
        level: 2,
        cost: "10 focus, each",
        rankAvg: [3, 4],
        description:
          "The team members all have Damage Reduction 4 for this round",
      },
      {
        level: 3,
        cost: "15 focus, each",
        rankAvg: [5, 6],
        description:
          "The team members all have Damage Reduction 8 for this round",
      },
    ],
  },
  {
    maneuverType: "Rally",
    levels: [
      {
        level: 1,
        cost: "5 focus, each",
        rankAvg: [1, 2],
        description:
          "All actions taken against team members have trouble this round.",
      },
      {
        level: 2,
        cost: "10 focus, each",
        rankAvg: [3, 4],
        description:
          "Each member of the team can make a speedy recovery roll for either Health or Focus, as if they had spent a point of Karma",
      },
      {
        level: 3,
        cost: "15 focus, each",
        rankAvg: [5, 6],
        description:
          "A single member of the team who has been killed or shattered in battle is healed to at least Health: 0 and Focus: 0",
      },
    ],
  },
];

MARVEL_MULTIVERSE.sizeEffects = {
  microscopic: {
    name: "Microscopic Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "microscopic",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: 5,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: 5,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  miniature: {
    name: "Miniature Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "miniature",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: 4,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: 4,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  tiny: {
    name: "Tiny Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "tiny",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: 3,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: 3,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  little: {
    name: "Little Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "little",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: 2,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: 2,
      },
      {
        key: "prototypeToken.width",
        mode: 1,
        value: 0.25,
      },
      {
        key: "prototypeToken.height",
        mode: 1,
        value: 0.25,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  small: {
    name: "Small Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "small",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: 1,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: 1,
      },
      {
        key: "system.movement.run.value",
        mode: 2,
        value: -1,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  average: {
    name: "Average Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "average",
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  big: {
    name: "Big Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "big",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: -1,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: -1,
      },
      {
        key: "system.reach",
        mode: 5,
        value: 2,
      },
      {
        key: "system.movement.run.value",
        mode: 2,
        value: 1,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  huge: {
    name: "Huge Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "huge",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: -2,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: -2,
      },
      {
        key: "system.reach",
        mode: 5,
        value: 5,
      },
      {
        key: "system.movement.run.value",
        mode: 1,
        value: 5,
      },
      {
        key: "system.abilities.mle.damageMultiplier",
        mode: 2,
        value: 2,
      },
      {
        key: "prototypeToken.width",
        mode: 1,
        value: 5,
      },
      {
        key: "prototypeToken.height",
        mode: 1,
        value: 5,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  gigantic: {
    name: "Gigantic Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "gigantic",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: -3,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: -3,
      },
      {
        key: "system.reach",
        mode: 5,
        value: 20,
      },
      {
        key: "system.movement.run.value",
        mode: 1,
        value: 20,
      },
      {
        key: "system.abilities.mle.damageMultiplier",
        mode: 2,
        value: 4,
      },
      {
        key: "prototypeToken.width",
        mode: 1,
        value: 20,
      },
      {
        key: "prototypeToken.height",
        mode: 1,
        value: 20,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  titanic: {
    name: "Titanic Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "titanic",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: -4,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: -4,
      },
      {
        key: "system.reach",
        mode: 5,
        value: 80,
      },
      {
        key: "system.movement.run.value",
        mode: 1,
        value: 80,
      },
      {
        key: "system.abilities.mle.damageMultiplier",
        mode: 2,
        value: 6,
      },
      {
        key: "prototypeToken.width",
        mode: 1,
        value: 80,
      },
      {
        key: "prototypeToken.height",
        mode: 1,
        value: 80,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
  gargantuan: {
    name: "Gargantuan Effects",
    disabled: false,
    changes: [
      {
        key: "system.size",
        mode: 5,
        value: "gargantuan",
      },
      {
        key: "system.abilities.mle.defense",
        mode: 2,
        value: -5,
      },
      {
        key: "system.abilities.agl.defense",
        mode: 2,
        value: -5,
      },
      {
        key: "system.reach",
        mode: 5,
        value: 320,
      },
      {
        key: "system.movement.run.value",
        mode: 1,
        value: 320,
      },
      {
        key: "system.abilities.mle.damageMultiplier",
        mode: 2,
        value: 8,
      },
      {
        key: "prototypeToken.width",
        mode: 1,
        value: 320,
      },
      {
        key: "prototypeToken.height",
        mode: 1,
        value: 320,
      },
    ],
    description: "",
    transfer: true,
    statuses: [],
    flags: {},
  },
};

// ASCII Artwork
MARVEL_MULTIVERSE.ASCII = `
=ccccc,      ,cccc       ccccc      ,cccc,  ?$$$$$$$,  ,ccc,   -ccc
:::"$$$$bc    $$$$$     ::'$$$$$c,  : $$$$$c':"$$$$???''."$$$$c,:'?$$c
'::::"?$$$$c,z$$$$F     ':: ?$$$$$c,':'$$$$$h':'?$$$,' :::'$$$$$$c,"$$h,
  '::::."$$$$$$$$$'    ..,,,:"$$$$$$h, ?$$$$$$c':"$$$$$$$b':"$$$$$$$$$$$c
    '::::"?$$$$$$    :"$$$$c:'$$$$$$$$d$$$P$$$b':'?$$$c : ::'?$$c "?$$$$h,
      ':::.$$$$$$$c,'::'????":'?$$$E"?$$$$h ?$$$.':?$$$h..,,,:"$$$,:."?$$$c
        ': $$$$$$$$$c, ::''  :::"$$$b '"$$$ :"$$$b':'?$$$$$$$c''?$F ':: "::
          .,$$$$$"?$$$$$c,    ':::"$$$$.::"$.:: ?$$$.:.???????" ':::  ' '''
          'J$$$$P'::"?$$$$h,   ':::'?$$$c'::'':: .:: : :::::''   '
        :,$$$$$':::::'?$$$$$c,  ::: "::  ::  ' ::'   ''
        .'J$$$$F  '::::: .::::    ' :::'  '
      .: ???):     ':: :::::
      : :::::'        '
        ''
`;

class ChatMessageMarvel extends ChatMessage {
  /** @inheritDoc */
  _initialize(options = {}) {
    super._initialize(options);
    Object.defineProperty(this, "user", {
      value: this.author,
      configurable: true,
    });
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async renderHTML(...args) {
    const html = await (typeof super.renderHTML === "function"
      ? super.renderHTML(...args)
      : super.getHTML(...args));
    const root = normalizeChatElement(html);
    if (!root) return html;

    if (hasDiceRoll(this)) await hydrateChatAutomationState(this);
    this._displayChatActionButtons(root);
    this._enrichChatCard(root);
    await this._enrichAttackTargets(root);

    /**
     * A hook event that fires after marvel-multiverse-specific chat message modifications have completed.
     * @function marvel-multiverse.renderChatMessage
     * @memberof hookEvents
     * @param {ChatMessageMarvel} message  Chat message being rendered.
     * @param {HTMLElement} html       HTML contents of the message.
     */
    Hooks.callAll("marvel-multiverse.renderChatMessage", this, root);

    return html;
  }

  /** @inheritDoc */
  async getHTML(...args) {
    return this.renderHTML(...args);
  }

  /**
   * Optionally hide the display of chat card action buttons which cannot be performed by the user
   * @param {jQuery} html     Rendered contents of the message.
   * @protected
   */
  _displayChatActionButtons(html) {
    const root = normalizeChatElement(html);
    if (!root) return;

    const chatCard = root.querySelector(".marvel-multiverse.chat-card");
    if (!chatCard) return;

    const flavor = root.querySelector(".flavor-text");
    const itemName = root.querySelector(".item-name");
    if (flavor && itemName && flavor.textContent === itemName.textContent) {
      flavor.remove();
    }

    if (this.shouldDisplayChallenge) {
      chatCard.dataset.displayChallenge = "";
    }

    // Conceal effects that the user cannot apply.
    for (const el of chatCard.querySelectorAll(".effects-tray .effect")) {
      if (
        !game.user.isGM &&
        (el.dataset.transferred === "false" || this.user.id !== game.user.id)
      ) {
        el.remove();
      }
    }

    // If the user is the message author or the actor owner, proceed
    const actor = game.actors.get(this.speaker.actor);
    if (game.user.isGM || actor?.isOwner || this.user.id === game.user.id) {
      const summonsButton = chatCard.querySelector('button[data-action="summon"]');
      if (summonsButton && !SummonsData.canSummon) {
        summonsButton.style.display = "none";
      }
      const template = chatCard.querySelector('button[data-action="placeTemplate"]');
      if (template && !game.user.can("TEMPLATE_CREATE")) {
        template.style.display = "none";
      }
      return;
    }

    // Otherwise conceal action buttons except for the request-roll and concentration controls
    for (const btn of chatCard.querySelectorAll("button[data-action]:not(.apply-effect)")) {
      if (["save", "rollRequest", "concentration"].includes(btn.dataset.action)) {
        continue;
      }
      btn.style.display = "none";
    }
  }

  /* -------------------------------------------- */

  /**
   * Augment the chat card markup for additional styling.
   * @param {HTMLElement} html  The chat card markup.
   * @protected
   */
  _enrichChatCard(html) {
    // Header matter
    const { scene: sceneId, token: tokenId, actor: actorId } = this.speaker;
    game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor ??
      game.actors.get(actorId);
    // let img;
    let nameText;
    if (this.isContentVisible) {
      nameText = this.alias;
    } else {
      nameText = this.user.name;
    }

    const avatar = document.createElement("div");
    const name = document.createElement("span");
    name.classList.add("name-stacked");
    name.innerHTML = `<span class="title">${nameText}</span>`;

    const sender = html.querySelector(".message-sender");
    sender?.replaceChildren(avatar, name);
    html.querySelector(".whisper-to")?.remove();

    // Context menu
    const metadata = html.querySelector(".message-metadata");
    metadata.querySelector(".message-delete")?.remove();
    const anchor = document.createElement("a");
    anchor.setAttribute(
      "aria-label",
      this._localizeOrFallback("MARVEL_MULTIVERSE.AdditionalControls", "Additional controls")
    );
    anchor.setAttribute("title", this._localizeOrFallback("MARVEL_MULTIVERSE.AdditionalControls", "Additional controls"));
    anchor.classList.add("chat-control");
    anchor.dataset.contextMenu = "";
    anchor.innerHTML = '<i class="fas fa-ellipsis-vertical fa-fw"></i>';
    metadata.appendChild(anchor);

    // SVG icons
    for (const el of html.querySelectorAll("i.marvel-multiverse-icon")) {
      const icon = document.createElement("marvel-multiverse-icon");
      icon.src = el.dataset.src;
      el.replaceWith(icon);
    }

    // Structured utility activations reuse the roll-context controls without manufacturing dice.
    const utilityActivation = this.getFlag("marvel-multiverse", "utilityActivation") ?? null;
    if (!hasDiceRoll(this) && !utilityActivation) return;

    if (this.isContentVisible) {
      const content = html.querySelector(".message-content");
      if (content) {
        const rollContext = this.getFlag("marvel-multiverse", "rollContext") ?? null;
        const isInitiativeRoll = this.getFlag("core", "initiativeRoll") === true;
        const compactCard = isCompactRollCard(rollContext, {
          initiativeRoll: isInitiativeRoll,
        });
        const attackResolution = this.getFlag("marvel-multiverse", "attackResolution") ?? null;
        const actionDamage = this.getFlag("marvel-multiverse", "actionDamage") ?? null;
        const damageContext = actionDamage?.damage ?? this.getFlag("marvel-multiverse", "damageContext") ?? null;
        const summary = buildRollSummary(rollContext, attackResolution, damageContext);
        const meta = buildRollCardMeta(rollContext, attackResolution, damageContext);
        const cardBadge = utilityActivation
          ? "Utility"
          : compactCard
          ? (isInitiativeRoll || rollContext?.actionType === "initiative" ? "Initiative" : "Roll")
          : rollContext?.rollType === "attack"
          ? "Attack"
          : rollContext?.dealsDamage || rollContext?.damageType
            ? "Power"
            : "Roll";

        const sourceActorUuid = rollContext?.actorUuid ?? null;
        const sourceActor = sourceActorUuid && typeof globalThis.fromUuidSync === "function"
          ? globalThis.fromUuidSync(sourceActorUuid)
          : null;
        const sourceName = sourceActor?.name ?? null;
        const targetNames = this._collectTargetNames(rollContext, attackResolution);
        const checkResolution = this.getFlag("marvel-multiverse", "checkResolution") ?? null;
        const checkOutcomeStatus = this._getCheckOutcomeStatus(rollContext, checkResolution);
        const outcomeStatus = this._getAttackOutcomeStatus(rollContext, attackResolution) ?? checkOutcomeStatus;
        const difficultyBannerMarkup = this._buildDifficultyBannerMarkup(checkResolution, checkOutcomeStatus);
        const attackerLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.Attacker", "Attacker");
        const targetsLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.Targets", "Targets");
        const sourceDisplayName = sourceName || this._localizeOrFallback("MARVEL_MULTIVERSE.UnknownAttacker", "Unknown attacker");
        const displayTargets = targetNames.length
          ? targetNames
          : [this._localizeOrFallback("MARVEL_MULTIVERSE.NoTargets", "No targets selected")];
        const sourceBadgeMarkup = `
          <div class="card-source card-participant-row">
            <span class="card-participant__label">${attackerLabel}</span>
            <span class="card-target__chip">${sourceDisplayName}</span>
          </div>
        `;
        const targetBadgeMarkup = `
          <div class="card-targets card-participant-row">
            <span class="card-participant__label">${targetsLabel}</span>
            ${displayTargets.map((name) => `<span class="card-target__chip">${name}</span>`).join("")}
          </div>
        `;
        const outcomeMarkup = outcomeStatus
          ? `<div class="card-outcome ${outcomeStatus.tone}">${outcomeStatus.label}</div>`
          : "";
        const guidedResolution = this.getFlag("marvel-multiverse", "guidedResolution") ?? null;
        const guidedSteps = buildGuidedResolutionStepper(guidedResolution);
        const guidedStepperMarkup = this._buildGuidedPhaseStepperMarkup(guidedSteps);

        const chatCard = document.createElement("div");
        chatCard.classList.add("marvel-multiverse", "chat-card");
        chatCard.innerHTML = `
          <section class="card-header description">
            <span class="card-badge">${cardBadge}</span>
            <header class="summary">
              <div class="name-stacked">
                <span class="eyebrow">Marvel Multiverse</span>
                <span class="title">${this.title ?? ""}</span>
                ${outcomeMarkup}
                ${difficultyBannerMarkup}
                ${meta?.badges?.length ? `<div class="card-meta">${meta.badges.map((badge) => `<span class="card-meta__item">${badge}</span>`).join("")}</div>` : ""}
              </div>
            </header>
            ${compactCard ? "" : sourceBadgeMarkup}
            ${compactCard ? "" : targetBadgeMarkup}
            ${compactCard ? "" : guidedStepperMarkup}
          </section>
        `;

        if (!compactCard && summary?.summaryItems?.length) {
          const summaryBlock = document.createElement("div");
          summaryBlock.classList.add("marvel-multiverse", "roll-summary");
          summaryBlock.innerHTML = `<ul class="roll-summary__list">${summary.summaryItems.map((item) => {
            const icon = /edge/i.test(item) ? "⚡" : /trouble/i.test(item) ? "⚠" : /fantastic/i.test(item) ? "✨" : /damage/i.test(item) ? "💥" : /attack/i.test(item) ? "🎯" : "◆";
            return `<li class="roll-summary__item"><span class="roll-summary__icon">${icon}</span><span>${item}</span></li>`;
          }).join("")}</ul>`;
          chatCard.appendChild(summaryBlock);
        }
        content.insertAdjacentElement("afterbegin", chatCard);
      }

      const flavorText = html.querySelector("span.flavor-text");
      const isInitiative = flavorText?.innerHTML.includes("Initiative");
      for (const el of html.querySelectorAll("button.retroEdgeMode")) {
        if (isInitiative) {
          el.setAttribute("data-initiative", true);
        }
        const retroHandler = this?._onClickRetroButton;
        if (typeof retroHandler === "function") {
          el.addEventListener("click", (event) => retroHandler.call(this, event));
        }
      }
      const damageHandler = typeof this?._onClickDamageButton === "function"
        ? this._onClickDamageButton.bind(this)
        : null;
      if (damageHandler) {
        attachClickHandler(html, "button.damage", this._onClickDamageButton, this);
      }
      this._renderDamageActionButtons(html);
      this._renderFocusActionButtons(html);
      this._renderFocusState(html);
      this._renderEscapeActionButtons(html);
      this._renderConcentrationActionButtons(html);
      this._renderConditionActionButtons(html);
      this._renderPowerEventActionButtons(html);
      this._renderConsumedFutureRollModifierActions(html);
      this._renderCheckResolutionActionButtons(html);
    }
  }

  /* -------------------------------------------- */

  /**
   * Augment attack cards with additional information.
   * @param {HTMLLIElement} html   The chat card.
   * @protected
   */
  async _enrichAttackTargets(html) {
    const attackRoll = this.rolls[0];
    if (!game.user.isGM || !(attackRoll instanceof CONFIG.Dice.MarvelMultiverseRoll)) return;

    let attackResolution = this.getFlag("marvel-multiverse", "attackResolution");
    if (!attackResolution?.targets?.length) {
      const refreshed = await refreshAttackResolution(this, { quiet: true, store: true });
      attackResolution = refreshed.after;
    }

    const targets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];
    if (!targets.length) return;

    const evaluation = document.createElement("ul");
    evaluation.classList.add("marvel-multiverse", "evaluation");
    evaluation.innerHTML = targets
      .map((target) => {
        const outcomeMeta = {
          "fantastic-hit": { cssClass: "fantastic-hit", icon: "fa-burst", key: "MARVEL_MULTIVERSE.AttackOutcome.FantasticHit", fallback: "Fantastic Hit" },
          "hit": { cssClass: "hit", icon: "fa-check", key: "MARVEL_MULTIVERSE.AttackOutcome.Hit", fallback: "Hit" },
          "miss": { cssClass: "miss", icon: "fa-times", key: "MARVEL_MULTIVERSE.AttackOutcome.Miss", fallback: "Miss" },
          "unresolved": { cssClass: "unresolved", icon: "fa-circle-question", key: "MARVEL_MULTIVERSE.AttackOutcome.Unresolved", fallback: "Unresolved" },
        }[target.outcome] ?? { cssClass: "unresolved", icon: "fa-circle-question", key: "MARVEL_MULTIVERSE.AttackOutcome.Unresolved", fallback: "Unresolved" };
        const outcomeLabel = this._localizeOrFallback(outcomeMeta.key, outcomeMeta.fallback);
        const defenseValue = typeof target.defenseValue === "number" ? target.defenseValue : "—";
        return `
        <li data-uuid="${target.uuid ?? ""}" class="target ${outcomeMeta.cssClass}">
          <img src="${target.actor?.img ?? target.img ?? ""}" alt="${target.name ?? "Target"}">
          <div class="name-stacked">
            <span class="title">
              ${target.name ?? "Target"}
              <i class="fas ${outcomeMeta.icon}" aria-hidden="true"></i>
              <span class="outcome-label">${outcomeLabel}</span>
            </span>
          </div>
          <div class="ac">
            <i class="fas fa-shield-halved" aria-hidden="true"></i>
            <span>${defenseValue}</span>
          </div>
        </li>
      `;
      })
      .join("");
    const targetMouseDown = this?._onTargetMouseDown;
    const targetHoverIn = this?._onTargetHoverIn;
    const targetHoverOut = this?._onTargetHoverOut;
    for (const target of evaluation.querySelectorAll("li.target")) {
      if (typeof targetMouseDown === "function") {
        target.addEventListener("click", (event) => targetMouseDown.call(this, event));
      }
      if (typeof targetHoverIn === "function") {
        target.addEventListener("mouseover", (event) => targetHoverIn.call(this, event));
      }
      if (typeof targetHoverOut === "function") {
        target.addEventListener("mouseout", (event) => targetHoverOut.call(this, event));
      }
    }
    html.querySelector(".message-content")?.appendChild(evaluation);
  }

  /* -------------------------------------------- */

  /**
   * Handle dice roll expansion.
   * @param {PointerEvent} event  The triggering event.
   * @protected
   */
  _onClickDiceRoll(event) {
    event.stopPropagation();
    const eventTarget = event.currentTarget;
    eventTarget.classList.toggle("expanded");
  }

  _collectTargetNames(rollContext, attackResolution) {
    const names = [];
    const seen = new Set();

    const pushName = (value) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      names.push(trimmed);
    };

    const attackTargets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];
    for (const target of attackTargets) {
      pushName(target?.name ?? target?.actor?.name ?? "");
    }

    if (names.length) return names;

    const targetUuids = Array.isArray(rollContext?.targetUuids) ? rollContext.targetUuids : [];
    for (const targetUuid of targetUuids) {
      if (typeof targetUuid !== "string" || !targetUuid.trim()) continue;
      const resolved = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(targetUuid) : null;
      pushName(resolved?.name ?? resolved?.actor?.name ?? "");
    }

    return names;
  }

  _localizeOrFallback(key, fallback) {
    const localized = game.i18n.localize(key);
    if (typeof localized === "string" && localized.trim() && localized !== key) {
      return localized;
    }
    return fallback;
  }

  _prepareActionButtons(container) {
    for (const button of container.querySelectorAll("button.action-button")) {
      const label = button.querySelector("span")?.textContent?.trim();
      if (!label) continue;
      button.setAttribute("aria-label", label);
      button.dataset.tooltip = label;
      button.setAttribute("title", label);
    }
  }

  /**
   * Build the accessible Configure/Roll/Resolve/Apply progress indicator markup for a guided resolution message.
   * @param {Array<{key:string,label:string,status:string}>|null} steps
   * @returns {string}
   */
  _buildGuidedPhaseStepperMarkup(steps) {
    if (!Array.isArray(steps) || !steps.length) return "";

    const statusLabels = {
      complete: this._localizeOrFallback("MARVEL_MULTIVERSE.GuidedPhaseStatus.Complete", "complete"),
      current: this._localizeOrFallback("MARVEL_MULTIVERSE.GuidedPhaseStatus.Current", "current step"),
      upcoming: this._localizeOrFallback("MARVEL_MULTIVERSE.GuidedPhaseStatus.Upcoming", "upcoming"),
      "not-required": this._localizeOrFallback("MARVEL_MULTIVERSE.GuidedPhaseStatus.NotRequired", "not required"),
      manual: this._localizeOrFallback("MARVEL_MULTIVERSE.GuidedPhaseStatus.Manual", "manual resolution"),
    };
    const progressLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.GuidedPhaseProgress", "Guided resolution progress");

    const items = steps.map((step) => {
      const ariaCurrent = step.status === "current" ? ' aria-current="step"' : "";
      const stateLabel = statusLabels[step.status] ?? statusLabels.upcoming;
      return `<li class="guided-phase-step is-${step.status}"${ariaCurrent}><span class="guided-phase-step__dot" aria-hidden="true"></span><span class="guided-phase-step__label">${step.label}</span><span class="visually-hidden">(${stateLabel})</span></li>`;
    }).join("");

    return `<ol class="guided-phase-stepper" role="list" aria-label="${progressLabel}">${items}</ol>`;
  }

  _resolveDamageType(rollContext, damageContext = null) {
    const raw = rollContext?.damageType ?? damageContext?.damageType ?? null;
    if (typeof raw !== "string") return null;
    const normalized = raw.trim().toLowerCase();
    return normalized === "focus" ? "focus" : normalized === "health" ? "health" : null;
  }

  _resolveBaseDamageAmount(rollContext, attackResolution, damageContext = null) {
    const explicit = Number(damageContext?.finalDamage);
    if (Number.isFinite(explicit)) return Math.max(0, Math.floor(explicit));

    const contextDamage = Number(rollContext?.damage?.total);
    if (Number.isFinite(contextDamage)) return Math.max(0, Math.floor(contextDamage));

    const attackDamage = Number(attackResolution?.damageTotal);
    if (Number.isFinite(attackDamage)) return Math.max(0, Math.floor(attackDamage));

    const total = Number(rollContext?.rollTotal);
    const isDamageRoll = Boolean(rollContext?.dealsDamage || rollContext?.damageType || damageContext?.dealsDamage || damageContext?.damageType);
    if (isDamageRoll && Number.isFinite(total)) return Math.max(0, Math.floor(total));

    return null;
  }

  _buildResolveActionLabel(message, rollContext, attackResolution, damageContext) {
    const baseLabel = game.i18n.localize("MARVEL_MULTIVERSE.ResolveAction") || "Resolve Action";
    const baseDamage = this._resolveBaseDamageAmount(rollContext, attackResolution, damageContext);
    if (typeof baseDamage !== "number" || !Number.isFinite(baseDamage)) {
      return baseLabel;
    }

    const damageType = this._resolveDamageType(rollContext, damageContext);
    const hitTargets = Array.isArray(attackResolution?.targets)
      ? attackResolution.targets.filter((target) => target?.outcome === "hit" || target?.outcome === "fantastic-hit")
      : [];

    if (!damageType || !hitTargets.length) {
      return `${baseLabel} ${baseDamage}`;
    }

    const effectiveAmounts = [];
    for (const target of hitTargets) {
      const targetUuid = target?.uuid ?? null;
      if (!targetUuid || typeof globalThis.fromUuidSync !== "function") continue;
      const resolved = globalThis.fromUuidSync(targetUuid);
      const actor = resolved?.documentName === "Token" ? resolved?.actor : resolved;
      if (!actor) continue;
      const drValue = damageType === "focus"
        ? Number(actor?.system?.focusDamageReduction ?? 0)
        : Number(actor?.system?.healthDamageReduction ?? 0);
      const safeDr = Number.isFinite(drValue) ? Math.max(0, Math.floor(drValue)) : 0;
      const effective = Math.max(0, baseDamage - safeDr);
      effectiveAmounts.push(effective);
    }

    if (!effectiveAmounts.length) {
      return `${baseLabel} ${baseDamage}`;
    }

    const minDamage = Math.min(...effectiveAmounts);
    const maxDamage = Math.max(...effectiveAmounts);
    const amountLabel = minDamage === maxDamage ? `${minDamage}` : `${minDamage}-${maxDamage}`;
    return `${baseLabel} ${amountLabel}`;
  }

  _getAttackOutcomeStatus(rollContext, attackResolution) {
    if (rollContext?.rollType !== "attack") return null;
    const targets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];
    const unresolvedLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.AttackOutcome.Unresolved", "Unresolved");
    if (!targets.length) {
      return { tone: "pending", label: unresolvedLabel };
    }

    const plainHitCount = targets.filter((target) => target?.outcome === "hit").length;
    const fantasticCount = targets.filter((target) => target?.outcome === "fantastic-hit").length;
    const hitCount = plainHitCount + fantasticCount;
    const missCount = targets.filter((target) => target?.outcome === "miss").length;
    const unresolvedCount = targets.filter((target) => target?.outcome === "unresolved").length;

    const hitLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.AttackOutcome.Hit", "Hit");
    const fantasticLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.AttackOutcome.FantasticHit", "Fantastic Hit");
    const missLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.AttackOutcome.Miss", "Miss");

    // All targets missed: this must always read clearly as "Miss", never as a partial hit count.
    if (missCount === targets.length) {
      const label = rollContext?.isFantastic
        ? this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.FantasticFailure", "Fantastic Failure")
        : missLabel;
      return { tone: "failure", label };
    }
    // Every target resolved and every hit was fantastic: call this out distinctly instead of
    // folding it into the generic "Hit" label.
    if (hitCount > 0 && unresolvedCount === 0 && missCount === 0 && fantasticCount === hitCount) {
      const label = targets.length === 1 ? fantasticLabel : `${hitCount}/${targets.length} ${fantasticLabel}`;
      return { tone: "success", label };
    }
    if (hitCount > 0 && unresolvedCount === 0) {
      const label = targets.length === 1
        ? hitLabel
        : (fantasticCount > 0 ? `${hitCount}/${targets.length} ${hitLabel} (${fantasticCount} ${fantasticLabel})` : `${hitCount}/${targets.length} ${hitLabel}`);
      return { tone: "success", label };
    }
    // Nothing resolved at all (e.g. every target became inaccessible/invalid before resolution).
    if (hitCount === 0 && missCount === 0 && unresolvedCount === targets.length) {
      return { tone: "pending", label: unresolvedLabel };
    }
    if (hitCount > 0 || unresolvedCount > 0) {
      const label = unresolvedCount > 0
        ? `${hitCount}/${targets.length} ${hitLabel} • ${unresolvedCount} ${unresolvedLabel}`
        : `${hitCount}/${targets.length} ${hitLabel}`;
      return { tone: hitCount > 0 ? "success" : "pending", label };
    }
    return { tone: "pending", label: unresolvedLabel };
  }

  _localizeFormatOrFallback(key, fallback, data = {}) {
    const template = this._localizeOrFallback(key, fallback);
    return Object.entries(data).reduce((text, [entryKey, value]) => text.replaceAll(`{${entryKey}}`, value), template);
  }

  /**
   * Determine Success/Failure/Fantastic Success (or, for an opposed check, Win/Loss/Tie) for a
   * Narrator-adjudicated check (no target, not an attack). Never invoked for attack rolls - those
   * resolve via _getAttackOutcomeStatus.
   */
  _getCheckOutcomeStatus(rollContext, checkResolution) {
    if (rollContext?.rollType === "attack" || !checkResolution) return null;
    if (checkResolution.mode === "opposed") {
      if (checkResolution.outcome === "fantastic-win") {
        return { tone: "fantastic", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.FantasticSuccess", "Fantastic Success") };
      }
      if (checkResolution.outcome === "fantastic-loss") {
        return { tone: "failure", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.FantasticFailure", "Fantastic Failure") };
      }
      if (checkResolution.outcome === "win") {
        return { tone: "success", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.OpposedWin", "Won Contest") };
      }
      if (checkResolution.outcome === "loss") {
        return { tone: "failure", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.OpposedLoss", "Lost Contest") };
      }
      if (checkResolution.outcome === "tie") {
        return { tone: "pending", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.OpposedTie", "Tied") };
      }
      return { tone: "pending", label: this._localizeOrFallback("MARVEL_MULTIVERSE.AttackOutcome.Unresolved", "Unresolved") };
    }
    if (checkResolution.outcome === "fantastic-success") {
      return { tone: "fantastic", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.FantasticSuccess", "Fantastic Success") };
    }
    if (checkResolution.outcome === "fantastic-failure") {
      return { tone: "failure", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.FantasticFailure", "Fantastic Failure") };
    }
    if (checkResolution.outcome === "success") {
      return { tone: "success", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.Success", "Success") };
    }
    if (checkResolution.outcome === "failure") {
      return { tone: "failure", label: this._localizeOrFallback("MARVEL_MULTIVERSE.CheckOutcome.Failure", "Failure") };
    }
    return { tone: "pending", label: this._localizeOrFallback("MARVEL_MULTIVERSE.AttackOutcome.Unresolved", "Unresolved") };
  }

  /**
   * Render the "Difficulty {N} vs {ability}" (or, in opposed mode, "Opposed {total}") banner so
   * the Narrator can visually double-check the number a player typed in against what was
   * actually called out at the table.
   */
  _buildDifficultyBannerMarkup(checkResolution, checkOutcomeStatus) {
    if (!checkResolution) return "";
    let text;
    if (checkResolution.mode === "opposed") {
      const opponentLabel = checkResolution.opponentLabel || this._localizeOrFallback("MARVEL_MULTIVERSE.DifficultyAgainstNone", "—");
      text = this._localizeFormatOrFallback("MARVEL_MULTIVERSE.OpposedBadge", "Opposed {opponentTotal} ({opponentLabel})", { opponentTotal: checkResolution.opponentTotal, opponentLabel });
    } else {
      const against = checkResolution.againstLabel || checkResolution.against;
      text = against
        ? this._localizeFormatOrFallback("MARVEL_MULTIVERSE.DifficultyBadge", "Difficulty {difficulty} vs {against}", { difficulty: checkResolution.difficulty, against })
        : this._localizeFormatOrFallback("MARVEL_MULTIVERSE.DifficultyBadgeNoAgainst", "Difficulty {difficulty}", { difficulty: checkResolution.difficulty });
    }
    const tone = checkOutcomeStatus?.tone ?? "pending";
    return `
      <div class="difficulty-banner is-${tone}">
        <span class="difficulty-banner__icon" aria-hidden="true"><i class="fas fa-bullseye"></i></span>
        <span class="difficulty-banner__text">${text}</span>
        ${checkOutcomeStatus ? `<span class="difficulty-banner__outcome">${checkOutcomeStatus.label}</span>` : ""}
      </div>`;
  }

  _collectHitTargetUuids(message) {
    const attackResolution = message.getFlag("marvel-multiverse", "attackResolution") ?? null;
    const hitTargets = Array.isArray(attackResolution?.targets)
      ? attackResolution.targets.filter((target) => target?.outcome === "hit" || target?.outcome === "fantastic-hit")
      : [];
    return hitTargets.map((target) => target?.uuid).filter(Boolean);
  }

  _resolveFocusCostContext(message, rollContext = null) {
    const context = rollContext ?? message?.getFlag?.("marvel-multiverse", "rollContext") ?? null;
    if (context?.focusCost && typeof context.focusCost === "object") {
      return context.focusCost;
    }

    const sourceCostText = context?.source?.costText ?? null;
    const parsedSource = parseFocusCost(sourceCostText);
    if (parsedSource?.valid) return parsedSource;

    const itemFlag = message?.getFlag?.("marvel-multiverse", "item") ?? null;
    const itemCostText = itemFlag?.system?.cost ?? itemFlag?.system?.focusCost ?? null;
    const parsedItemFlag = parseFocusCost(itemCostText);
    if (parsedItemFlag?.valid) return parsedItemFlag;

    const itemUuid = context?.itemUuid ?? null;
    const item = itemUuid && typeof globalThis.fromUuidSync === "function"
      ? globalThis.fromUuidSync(itemUuid)
      : null;
    const itemCost = item?.system?.cost ?? item?.system?.focusCost ?? null;
    const parsedItem = parseFocusCost(itemCost);
    if (parsedItem?.valid) return parsedItem;

    const legacyFlavor = String(message?.flavor ?? "");
    const legacyContent = String(message?.content ?? "");
    const costMatch = legacyFlavor.match(/cost\s*[:\-]\s*([^<\n]+)/i)
      ?? legacyContent.match(/cost\s*[:\-]\s*([^<\n]+)/i);
    if (costMatch?.[1]) {
      const parsedLegacy = parseFocusCost(costMatch[1].trim());
      if (parsedLegacy?.valid) return parsedLegacy;
    }

    return null;
  }

  async _applyIntegratedConditions(message) {
    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const appliedResults = [];

    const targetConditions = Array.isArray(rollContext?.conditions) ? rollContext.conditions : [];
    if (targetConditions.length) {
      const conditionTargets = getEligibleConditionTargetUuids(message, { rollContext });
      if (conditionTargets.length) {
        const targetResult = await applyMessageConditions(message, {
          conditions: targetConditions,
          targetUuids: conditionTargets,
          quiet: true,
        });
        appliedResults.push({ type: "target", result: targetResult });
      }
    }

    const sourceConditions = Array.isArray(rollContext?.sourceConditions) ? rollContext.sourceConditions : [];
    const sourceActorUuid = rollContext?.actorUuid ?? null;
    if (sourceConditions.length && sourceActorUuid) {
      const sourceResult = await applyMessageConditions(message, {
        conditions: sourceConditions,
        targetUuids: [sourceActorUuid],
        quiet: true,
      });
      appliedResults.push({ type: "source", result: sourceResult });
    }

    return appliedResults;
  }

  async _handleResolveAction(message, button) {
    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const costContext = this._resolveFocusCostContext(message, rollContext);
    const actorUuid = rollContext?.actorUuid ?? (message?.speaker?.actor ? `Actor.${message.speaker.actor}` : null);
    if (costContext && !rollContext?.actorUuid && actorUuid) {
      await updateChatMessageFlags(message, {
        "marvel-multiverse": {
          rollContext: {
            ...(rollContext ?? {}),
            actorUuid,
          },
        },
      });
    }
    const focusTransactions = getFocusTransactions(message) ?? [];
    const hasUnrefundedSpend = focusTransactions.some((entry) => entry?.type === "spend" && !entry?.refunded);
    const actionFocus = message.getFlag("marvel-multiverse", "actionFocus") ?? null;
    const hasPaidActionFocus = Boolean(actionFocus && actionFocus.refunded !== true);

    if (rollContext?.rollType === "attack") {
      const hasTargets = Array.isArray(rollContext?.targetUuids) && rollContext.targetUuids.length > 0;
      if (!hasTargets) {
        ui.notifications.warn(game.i18n.localize("MARVEL_MULTIVERSE.TargetRequired") || "Select at least one target before using an attack power.");
        return;
      }
    }

    if (costContext && !hasUnrefundedSpend && !hasPaidActionFocus) {
      let focusOptions = { quiet: true };
      if (costContext?.type === "variable") {
        const minimum = typeof costContext.minimum === "number" ? costContext.minimum : 0;
        const maximum = typeof costContext.maximum === "number" ? costContext.maximum : null;
        const amount = await promptDialog({
          title: game.i18n.localize("MARVEL_MULTIVERSE.ChooseFocusCost") || "Choose Focus Cost",
          content: `<p><label>${game.i18n.localize("MARVEL_MULTIVERSE.EnterAmount") || "Enter amount"}</label><input type="number" min="${minimum}" step="1" value="${minimum}" /></p>`,
          callback: (root) => {
            const value = Number(root.querySelector("input")?.value);
            return Number.isFinite(value) && Number.isInteger(value) ? value : null;
          },
        });
        if (amount === null || Number.isNaN(amount) || !Number.isInteger(amount) || amount < minimum || (maximum !== null && amount > maximum)) {
          return;
        }
        focusOptions = { quiet: true, amount };
      }

      const focusResult = await spendMessageFocus(message, focusOptions);
      if (!focusResult?.success) {
        ui.notifications.warn(focusResult?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.FocusSpendFailed") || "Focus spend failed.");
        return;
      }
    }

    let attackOutcomeSummary = null;
    if (rollContext?.rollType === "attack") {
      const refreshedAttack = await refreshAttackResolution(message, { quiet: true, store: true });
      attackOutcomeSummary = refreshedAttack?.after?.summary ?? refreshedAttack?.summary ?? null;
    }

    let damageResult = null;
    const autoApplyDamage = game.settings.get("marvel-multiverse", "autoApplyDamageOnResolve") !== false;
    // Skip if damage was already applied for this message (e.g. the optional auto-apply-on-hit
    // socketlib feature already handled it) so resolving the action doesn't double-apply damage.
    const alreadyApplied = hasAppliedMessageDamage(message);
    if (autoApplyDamage && !alreadyApplied && (rollContext?.dealsDamage || rollContext?.damageType)) {
      damageResult = await requestApplyMessageDamage(message.id, { mode: "full" });
    }

    await this._applyIntegratedConditions(message);

    if (getGuidedResolutionState(message)) {
      await markGuidedResolutionResolved(message, { outcomeSummary: attackOutcomeSummary });
      if (damageResult?.success && damageResult?.transactionId) {
        await markGuidedResolutionApplied(message, { transactionId: damageResult.transactionId });
      }
    }

    if (button) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.ActionResolved") || "Action Resolved";
    }

    // NO_ELIGIBLE_TARGETS just means every target missed (expected, not an error) - only
    // surface a warning for genuine damage-application failures the GM should know about.
    let resolveNotice = game.i18n.localize("MARVEL_MULTIVERSE.ActionResolved") || "Action resolved.";
    let resolveNoticeIsWarning = false;
    if (damageResult && !damageResult.success && damageResult.issues?.[0]?.code !== "NO_ELIGIBLE_TARGETS") {
      resolveNoticeIsWarning = true;
      resolveNotice = damageResult.issues?.[0]?.message
        || game.i18n.localize("MARVEL_MULTIVERSE.DamageApplyFailed")
        || "Action resolved, but damage could not be applied.";
    } else if (damageResult?.success && damageResult.targets?.failed?.length) {
      resolveNoticeIsWarning = true;
      resolveNotice = game.i18n.localize("MARVEL_MULTIVERSE.DamagePartiallyApplied") || "Action resolved, but damage failed for one or more targets.";
    }
    if (resolveNoticeIsWarning) ui.notifications.warn(resolveNotice);
    else ui.notifications.info(resolveNotice);
  }

  _renderDamageActionButtons(html) {
    const buttonGroup = resolveChatActionContainer(html);
    if (!buttonGroup) return;

    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    if (!messageId) return;

    const message = game.messages.get(messageId);
    if (!message) return;
    if (message.getFlag("marvel-multiverse", "utilityActivation")) return;

    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const attackResolution = message.getFlag("marvel-multiverse", "attackResolution") ?? null;
    const damageContext = message.getFlag("marvel-multiverse", "damageContext") ?? null;
    const costContext = this._resolveFocusCostContext(message, rollContext);
    const hasTargetConditions = Array.isArray(rollContext?.conditions) && rollContext.conditions.length > 0;
    const hasSourceConditions = Array.isArray(rollContext?.sourceConditions) && rollContext.sourceConditions.length > 0;
    const hasAutomation = Boolean(
      rollContext?.rollType === "attack"
      || costContext
      || hasTargetConditions
      || hasSourceConditions
      || rollContext?.source?.itemName
    );
    const hasStoredTargets = Array.isArray(rollContext?.targetUuids) && rollContext.targetUuids.length > 0;
    const hasLegacyDamageHint = /damagetype\s*:/i.test(String(message?.flavor ?? ""))
      || /damagetype\s*:/i.test(String(message?.content ?? ""));
    const explicitlyNoDamage = rollContext?.dealsDamage === false || damageContext?.dealsDamage === false;
    const hasDamage = !explicitlyNoDamage && Boolean(
      rollContext?.dealsDamage
      || damageContext?.dealsDamage
      || (rollContext?.damageType || damageContext?.damageType)
      || hasLegacyDamageHint
    );
    if (!hasDamage && !hasAutomation) return;

    // Once an attack has fully resolved with no hit targets at all (every target is a confirmed
    // miss, or unresolved with nothing left pending), the normal damage-application controls
    // would be a guaranteed no-op. Hide them so the card doesn't imply damage can still be applied.
    const resolvedTargets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];
    const hasEligibleHitTarget = resolvedTargets.some((target) => target?.outcome === "hit" || target?.outcome === "fantastic-hit");
    const attackConfirmedNoHit = rollContext?.rollType === "attack" && resolvedTargets.length > 0 && !hasEligibleHitTarget;

    // Damage may already have been applied by the optional auto-apply-on-hit feature (or a prior
    // manual click) before this card is even rendered/re-rendered. Hide the apply-mode buttons in
    // that case so a GM can't accidentally double-apply damage; Undo remains available.
    const alreadyAppliedDamage = hasAppliedMessageDamage(message);

    const actions = [
      { action: "resolveAction", label: this._buildResolveActionLabel(message, rollContext, attackResolution, damageContext), mode: "resolve" },
      { action: "applyDamage", label: game.i18n.localize("MARVEL_MULTIVERSE.ApplyDamage") || "DMG", mode: "full" },
      { action: "applyHalfDamage", label: game.i18n.localize("MARVEL_MULTIVERSE.ApplyHalfDamage") || "½", mode: "half" },
      { action: "applyDoubleDamage", label: game.i18n.localize("MARVEL_MULTIVERSE.ApplyDoubleDamage") || "×2", mode: "double" },
      { action: "applyCustomDamage", label: game.i18n.localize("MARVEL_MULTIVERSE.ApplyCustomDamage") || "…", mode: "custom" },
      { action: "undoDamage", label: game.i18n.localize("MARVEL_MULTIVERSE.UndoDamage") || "↺", mode: "undo" },
    ];

    const damageApplyActions = new Set(["applyDamage", "applyHalfDamage", "applyDoubleDamage", "applyCustomDamage"]);
    const visibleActions = actions.filter((entry) => {
      if (attackConfirmedNoHit && damageApplyActions.has(entry.action)) return false;
      if (alreadyAppliedDamage && damageApplyActions.has(entry.action)) return false;
      if (entry.action === "resolveAction") return hasAutomation || hasDamage;
      if (!hasDamage) return entry.action === "resolveAction";
      return true;
    });

    const container = document.createElement("div");
    container.classList.add("marvel-multiverse", "damage-actions", "action-panel");
    container.setAttribute("aria-live", "polite");
    container.innerHTML = visibleActions.map(({ action, label, mode }) => {
      const icon = action === "resolveAction"
        ? "fa-wand-magic-sparkles"
        : action === "undoDamage"
          ? "fa-rotate-left"
          : mode === "custom"
            ? "fa-sliders-h"
            : mode === "half"
              ? "fa-heart-crack"
              : mode === "double"
                ? "fa-burst"
                : "fa-swords";
      const tone = action === "undoDamage" ? "secondary" : mode === "custom" ? "secondary" : mode === "half" ? "secondary" : mode === "double" ? "accent" : "primary";
      return `<button type="button" class="action-button ${tone}" data-action="${action}" data-damage-mode="${mode}"><i class="fas ${icon}" aria-hidden="true"></i><span>${label}</span></button>`;
    }).join("");
    this._prepareActionButtons(container);
    buttonGroup.appendChild(container);

    for (const button of container.querySelectorAll("button[data-action]")) {
      button.addEventListener("click", (event) => this._onDamageActionButton(event, message));
    }
  }

  _renderFocusState(html) {
    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    if (!messageId) return;

    const message = game.messages.get(messageId);
    if (!message) return;

    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const costContext = this._resolveFocusCostContext(message, rollContext);
    const actorUuid = rollContext?.actorUuid ?? (message?.speaker?.actor ? `Actor.${message.speaker.actor}` : null);
    if (!actorUuid || !costContext) return;

    const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(actorUuid) : null;
    const transactions = getFocusTransactions(message) ?? [];
    const lastTransaction = [...transactions].reverse().find((entry) => entry?.type === "spend");
    const actionFocus = message.getFlag("marvel-multiverse", "actionFocus") ?? null;
    const content = html.querySelector(".message-content");
    if (!content) return;

    const state = document.createElement("div");
    state.classList.add("marvel-multiverse", "focus-state");
    const focusLabel = game.i18n.localize("MARVEL_MULTIVERSE.FocusStatus") || "Focus";
    const paidLabel = game.i18n.localize("MARVEL_MULTIVERSE.FocusPaid") || "Focus Paid";
    const refundedLabel = game.i18n.localize("MARVEL_MULTIVERSE.FocusRefunded") || "Focus Refunded";
    const costDisplay = costContext?.type === "fixed"
      ? `${costContext.value}`
      : costContext?.type === "variable"
        ? `${costContext.minimum ?? 0}+`
        : "?";
    const displayedSpend = lastTransaction ?? actionFocus;
    const amountText = displayedSpend?.appliedAmount != null
      ? `${displayedSpend.appliedAmount}`
      : displayedSpend?.amount != null
        ? `${displayedSpend.amount}`
      : costDisplay;
    const statusText = displayedSpend?.refunded
      ? refundedLabel
      : displayedSpend
        ? `${paidLabel}: ${amountText}`
        : `${focusLabel}: ${actor?.system?.focus?.value ?? "—"}`;
    state.innerHTML = `<div class="focus-summary">${statusText}</div>`;
    content.appendChild(state);
  }

  _renderFocusActionButtons(html) {
    const buttonGroup = resolveChatActionContainer(html);
    if (!buttonGroup) return;

    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    if (!messageId) return;

    const message = game.messages.get(messageId);
    if (!message) return;

    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const costContext = this._resolveFocusCostContext(message, rollContext);
    const actorUuid = rollContext?.actorUuid ?? (message?.speaker?.actor ? `Actor.${message.speaker.actor}` : null);
    if (!actorUuid || !costContext) return;

    const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(actorUuid) : null;
    const canSpend = Boolean(game.user?.isGM || actor?.isOwner || actor?.owner);
    if (!canSpend) return;

    const transactions = getFocusTransactions(message) ?? [];
    const actionFocus = message.getFlag("marvel-multiverse", "actionFocus") ?? null;
    const hasSpend = transactions.some((entry) => entry?.type === "spend" && !entry?.refunded)
      || Boolean(actionFocus && actionFocus.refunded !== true);
    const actions = [];
    if (!hasSpend) {
      if (costContext?.type === "fixed") {
        actions.push({ action: "spendFocus", label: `${game.i18n.localize("MARVEL_MULTIVERSE.SpendFocus") || "Spend Focus"} ${costContext.value}` });
      } else if (costContext?.type === "variable") {
        actions.push({ action: "chooseFocusCost", label: game.i18n.localize("MARVEL_MULTIVERSE.ChooseFocusCost") || "Choose Focus Cost" });
      } else if (costContext?.type === "choice") {
        actions.push({ action: "chooseFocusCost", label: game.i18n.localize("MARVEL_MULTIVERSE.ChooseFocusCost") || "Choose Focus Cost" });
      } else if (game.user?.isGM) {
        actions.push({ action: "customFocus", label: game.i18n.localize("MARVEL_MULTIVERSE.SpendCustomFocus") || "Spend Custom Focus" });
      }
    }
    if (hasSpend) {
      actions.push({ action: "refundFocus", label: game.i18n.localize("MARVEL_MULTIVERSE.RefundFocus") || "Refund Focus" });
    }

    if (!actions.length) return;

    const container = document.createElement("div");
    container.classList.add("marvel-multiverse", "focus-actions", "action-panel");
    container.innerHTML = actions.map(({ action, label }) => {
      const icon = action === "refundFocus" ? "fa-rotate-left" : action === "chooseFocusCost" ? "fa-hand-holding-heart" : "fa-bolt";
      const tone = action === "refundFocus" ? "secondary" : "primary";
      return `<button type="button" class="action-button ${tone}" data-action="${action}"><i class="fas ${icon}"></i><span>${label}</span></button>`;
    }).join("");
    this._prepareActionButtons(container);
    buttonGroup.appendChild(container);

    for (const button of container.querySelectorAll("button[data-action]")) {
      button.addEventListener("click", (event) => this._onFocusActionButton(event, message));
    }
  }

  _renderConcentrationActionButtons(html) {
    const buttonGroup = resolveChatActionContainer(html);
    if (!buttonGroup) return;

    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    if (!messageId) return;

    const message = game.messages.get(messageId);
    if (!message) return;

    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    if (!rollContext?.requiresConcentration) return;

    const actorUuid = rollContext?.actorUuid ?? null;
    if (!actorUuid) return;

    const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(actorUuid) : null;
    const actorRecord = actor?.actor ?? actor;
    const canAct = Boolean(game.user?.isGM || actorRecord?.isOwner || actorRecord?.owner);
    if (!canAct) return;

    const content = html.querySelector(".message-content");
    if (!content) return;

    const container = document.createElement("div");
    container.classList.add("marvel-multiverse", "concentration-actions", "action-panel", "compact-inline");
    const startLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.StartConcentration", "Start Concentration");
    const endLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.EndConcentration", "End Concentration");
    container.innerHTML = `
      <button type="button" class="action-button primary" data-action="startConcentration"><i class="fas fa-circle-dot"></i><span>${startLabel}</span></button>
      <button type="button" class="action-button secondary" data-action="endConcentration"><i class="fas fa-circle-stop"></i><span>${endLabel}</span></button>
    `;
    this._prepareActionButtons(container);
    content.appendChild(container);

    for (const button of container.querySelectorAll("button[data-action]")) {
      button.addEventListener("click", (event) => this._onConcentrationActionButton(event, message));
    }
  }

  async _onConcentrationActionButton(event, message) {
    event.stopPropagation();
    const action = event.currentTarget.dataset.action;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (action === "startConcentration") {
        await this._handleStartConcentration(message, button);
      } else if (action === "endConcentration") {
        await this._handleEndConcentration(message, button);
      }
    } finally {
      button.disabled = false;
    }
  }

  _renderConditionActionButtons(html) {
    const buttonGroup = resolveChatActionContainer(html);
    if (!buttonGroup) return;

    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    if (!messageId) return;

    const message = game.messages.get(messageId);
    if (!message) return;

    const conditions = getMessageConditions(message);
    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const sourceConditions = Array.isArray(rollContext?.sourceConditions) ? rollContext.sourceConditions : [];

    // Target-triggered conditions never apply to a target that didn't get hit. Once an attack has
    // fully resolved with no hit targets, only keep the button around if source-side conditions
    // (which apply regardless of hit outcome) still have something to do.
    const attackResolution = message.getFlag("marvel-multiverse", "attackResolution") ?? null;
    const resolvedTargets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];
    const hasEligibleHitTarget = resolvedTargets.some((target) => target?.outcome === "hit" || target?.outcome === "fantastic-hit");
    const attackConfirmedNoHit = rollContext?.rollType === "attack" && resolvedTargets.length > 0 && !hasEligibleHitTarget;
    const targetConditionsUsable = conditions.length > 0 && !attackConfirmedNoHit;
    if (!targetConditionsUsable && !sourceConditions.length) return;
    const canUndo = getConditionApplications(message).some((entry) => !entry?.undone);

    const canAct = Boolean(game.user?.isGM || message?.isOwner || message?.author?.isOwner || message?.user?.isOwner);
    if (!canAct) return;

    const container = document.createElement("div");
    container.classList.add("marvel-multiverse", "condition-actions", "action-panel", "compact-inline");
    const applyLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.ApplyConditions", "Apply Conditions");
    const undoLabel = this._localizeOrFallback("MARVEL_MULTIVERSE.UndoConditions", "Undo Conditions");
    container.innerHTML = `
      <button type="button" class="action-button primary" data-action="applyConditions"><i class="fas fa-plus"></i><span>${applyLabel}</span></button>
      ${canUndo ? `<button type="button" class="action-button secondary" data-action="undoConditions"><i class="fas fa-rotate-left"></i><span>${undoLabel}</span></button>` : ""}
    `;
    this._prepareActionButtons(container);
    buttonGroup.appendChild(container);

    for (const button of container.querySelectorAll("button[data-action]")) {
      button.addEventListener("click", (event) => this._onConditionActionButton(event, message));
    }
  }

  async _onConditionActionButton(event, message) {
    event.stopPropagation();
    const action = event.currentTarget.dataset.action;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (action === "applyConditions") {
        await this._handleApplyConditions(message, button);
      } else if (action === "undoConditions") {
        await this._handleUndoConditions(message, button);
      }
    } finally {
      button.disabled = false;
    }
  }

  async _handleApplyConditions(message, button) {
    const results = await this._applyIntegratedConditions(message);
    const hadSuccess = results.some((entry) => entry?.result?.success);
    if (hadSuccess) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.ConditionsApplied") || "Conditions Applied";
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.ConditionsApplied") || "Conditions applied.");
      return;
    }
    const firstIssue = results.find((entry) => entry?.result?.issues?.length)?.result?.issues?.[0];
    ui.notifications.warn(firstIssue?.message || game.i18n.localize("MARVEL_MULTIVERSE.ConditionsApplyFailed") || "Condition application failed.");
  }

  async _handleUndoConditions(message, button) {
    let undoneCount = 0;
    for (let index = 0; index < 5; index += 1) {
      const result = await undoMessageConditions(message, { quiet: true });
      if (!result?.success) break;
      undoneCount += 1;
    }
    if (undoneCount > 0) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.ConditionsUndone") || "Conditions Undone";
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.ConditionsUndone") || "Conditions undone.");
      return;
    }
    ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.ConditionsUndoFailed") || "Condition undo failed.");
  }

  /**
   * Render the "Set Difficulty"/"Update Difficulty" button for a Narrator-adjudicated check -
   * any roll that isn't an attack and has no resolved targets (plain ability checks, non-attack
   * powers/items). This is the manual-input resolver for actions the system can't auto-resolve
   * against a target's defense value.
   */
  _renderCheckResolutionActionButtons(html) {
    const buttonGroup = resolveChatActionContainer(html);
    if (!buttonGroup) return;

    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    if (!messageId) return;

    const message = game.messages.get(messageId);
    if (!message) return;
    if (message.getFlag("marvel-multiverse", "utilityActivation")) return;

    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    if (!rollContext || rollContext.rollType === "attack" || isCompactRollCard(rollContext, {
      initiativeRoll: message.getFlag("core", "initiativeRoll") === true,
    })) return;
    const hasTargets = Array.isArray(rollContext.targetUuids) && rollContext.targetUuids.length > 0;
    if (hasTargets) return;

    const existing = getCheckResolution(message) ?? this._getConfiguredCheckDifficulty(message, rollContext);
    const label = existing
      ? (game.i18n.localize("MARVEL_MULTIVERSE.UpdateDifficulty") || "Update Difficulty")
      : (game.i18n.localize("MARVEL_MULTIVERSE.SetDifficulty") || "Set Difficulty");

    const container = document.createElement("div");
    container.classList.add("marvel-multiverse", "check-resolution-actions", "action-panel", "compact-inline");
    container.innerHTML = `<button type="button" class="action-button primary" data-action="setDifficulty"><i class="fas fa-bullseye" aria-hidden="true"></i><span>${label}</span></button>`;
    this._prepareActionButtons(container);
    buttonGroup.appendChild(container);

    container.querySelector("button[data-action='setDifficulty']")
      ?.addEventListener("click", (event) => this._onCheckResolutionActionButton(event, message));
  }

  _getConfiguredCheckDifficulty(message, rollContext = null) {
    const context = rollContext ?? message.getFlag("marvel-multiverse", "rollContext") ?? null;
    if (context?.targetNumber === null || context?.targetNumber === undefined || context?.targetNumber === "") return null;
    const difficulty = Number(context.targetNumber);
    if (!Number.isFinite(difficulty)) return null;
    return { mode: "difficulty", difficulty, against: context.ability ?? null };
  }

  async _onCheckResolutionActionButton(event, message) {
    event.stopPropagation();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await this._handleSetCheckDifficulty(message, button);
    } finally {
      button.disabled = false;
    }
  }

  async _handleSetCheckDifficulty(message, button) {
    const existing = getCheckResolution(message) ?? this._getConfiguredCheckDifficulty(message);
    const selection = await this._promptCheckDifficultyDialog(existing);
    if (!selection) return;

    const result = selection.mode === "opposed"
      ? await applyOpposedCheck(message, selection)
      : await applyCheckDifficulty(message, selection);
    if (!result?.success) {
      ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.DifficultyInvalid") || "Enter a valid numeric difficulty.");
      return;
    }

    const updatedLabel = game.i18n.localize("MARVEL_MULTIVERSE.UpdateDifficulty") || "Update Difficulty";
    button.innerHTML = `<i class="fas fa-bullseye" aria-hidden="true"></i><span>${updatedLabel}</span>`;
    ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.DifficultySet") || "Difficulty locked in.");
  }

  /**
   * Dialog box (never inline on the card) where a player types in the difficulty the Narrator
   * called out, plus which ability/state it's checked against, purely on the honor system - no
   * permission gate, no automatic lookup of a "correct" number. If the "enableOpposedCheckAutomation"
   * world setting is on, also offers an opposed-check mode (compare this roll's total directly
   * against a manually entered opponent total instead of a fixed difficulty number).
   */
  async _promptCheckDifficultyDialog(existing = null) {
    const opposedEnabled = Boolean(game.settings?.get?.("marvel-multiverse", "enableOpposedCheckAutomation"));
    const abilityOptions = Object.entries(CONFIG.MARVEL_MULTIVERSE.abilities ?? {})
      .map(([key, labelKey]) => ({ key, label: game.i18n.localize(labelKey) }));

    const title = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyDialogTitle") || "Call Your Shot";
    const hint = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyDialogHint") || "Enter the difficulty the Narrator called out, and what it's checked against.";
    const difficultyLabel = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyLabel") || "Difficulty";
    const againstLabel = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyAgainstLabel") || "Against";
    const noneLabel = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyAgainstNone") || "—";
    const confirmLabel = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyConfirm") || "Lock It In";
    const modeLabel = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyDialogModeLabel") || "Compare Against";
    const modeFixedLabel = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyDialogModeFixed") || "Fixed Difficulty Number";
    const modeOpposedLabel = game.i18n.localize("MARVEL_MULTIVERSE.DifficultyDialogModeOpposed") || "Opposing Roll Total";
    const opponentTotalLabel = game.i18n.localize("MARVEL_MULTIVERSE.OpponentTotalLabel") || "Opponent's Total";
    const opponentFantasticLabel = game.i18n.localize("MARVEL_MULTIVERSE.OpponentFantasticLabel") || "Opponent Rolled Fantastic";
    const opponentLabelLabel = game.i18n.localize("MARVEL_MULTIVERSE.OpponentLabelLabel") || "Opponent (name/label)";
    const isOpposed = existing?.mode === "opposed";

    const content = `
      <form class="mm-difficulty-dialog">
        <p class="mm-difficulty-dialog__hint">${hint}</p>
        ${opposedEnabled ? `
        <div class="form-group">
          <label for="mm-check-mode">${modeLabel}</label>
          <select id="mm-check-mode">
            <option value="difficulty" ${!isOpposed ? "selected" : ""}>${modeFixedLabel}</option>
            <option value="opposed" ${isOpposed ? "selected" : ""}>${modeOpposedLabel}</option>
          </select>
        </div>` : ""}
        <div class="mm-check-mode-section" data-mode-section="difficulty">
          <div class="form-group">
            <label for="mm-check-difficulty">${difficultyLabel}</label>
            <input id="mm-check-difficulty" type="number" step="1" value="${!isOpposed ? (existing?.difficulty ?? "") : ""}" autofocus />
          </div>
          <div class="form-group">
            <label for="mm-check-against">${againstLabel}</label>
            <select id="mm-check-against">
              <option value="">${noneLabel}</option>
              ${abilityOptions.map((entry) => `<option value="${entry.key}" ${!isOpposed && existing?.against === entry.key ? "selected" : ""}>${entry.label}</option>`).join("")}
            </select>
          </div>
        </div>
        ${opposedEnabled ? `
        <div class="mm-check-mode-section" data-mode-section="opposed" ${!isOpposed ? "hidden" : ""}>
          <div class="form-group">
            <label for="mm-check-opponent-total">${opponentTotalLabel}</label>
            <input id="mm-check-opponent-total" type="number" step="1" value="${isOpposed ? (existing?.opponentTotal ?? "") : ""}" />
          </div>
          <div class="form-group form-group-checkbox">
            <label for="mm-check-opponent-fantastic">${opponentFantasticLabel}</label>
            <input id="mm-check-opponent-fantastic" type="checkbox" ${isOpposed && existing?.opponentIsFantastic ? "checked" : ""} />
          </div>
          <div class="form-group">
            <label for="mm-check-opponent-label">${opponentLabelLabel}</label>
            <input id="mm-check-opponent-label" type="text" value="${isOpposed ? (existing?.opponentLabel ?? "") : ""}" />
          </div>
        </div>` : ""}
      </form>`;

    return promptDialog({
      title,
      content,
      label: confirmLabel,
      render: (root) => {
        const modeSelect = root.querySelector("#mm-check-mode");
        if (!modeSelect) return;
        const sections = root.querySelectorAll("[data-mode-section]");
        const applyVisibility = () => {
          sections.forEach((section) => {
            section.hidden = section.dataset.modeSection !== modeSelect.value;
          });
        };
        modeSelect.addEventListener("change", applyVisibility);
      },
      callback: (root) => {
        const mode = root.querySelector("#mm-check-mode")?.value || "difficulty";
        if (mode === "opposed") {
          const opponentTotal = Number(root.querySelector("#mm-check-opponent-total")?.value);
          if (!Number.isFinite(opponentTotal)) return null;
          const opponentIsFantastic = Boolean(root.querySelector("#mm-check-opponent-fantastic")?.checked);
          const opponentLabel = root.querySelector("#mm-check-opponent-label")?.value?.trim() || null;
          return { mode: "opposed", opponentTotal, opponentIsFantastic, opponentLabel };
        }
        const value = Number(root.querySelector("#mm-check-difficulty")?.value);
        if (!Number.isFinite(value)) return null;
        const against = root.querySelector("#mm-check-against")?.value || null;
        const resolvedAgainstLabel = against ? (abilityOptions.find((entry) => entry.key === against)?.label ?? against) : null;
        return { mode: "difficulty", difficulty: value, against, againstLabel: resolvedAgainstLabel };
      },
    });
  }

  /**
   * Render a preview + a single consolidated "Apply Power Outcomes" button for items that define
   * structured `system.events` (see lib/services/power-events.mjs). Phase 1 scope: one button that
   * applies every automated outcome already matched against the stored, hit-filtered targets.
   */
  _renderPowerEventActionButtons(html) {
    const buttonGroup = resolveChatActionContainer(html);
    if (!buttonGroup) return;

    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    if (!messageId) return;

    const message = game.messages.get(messageId);
    if (!message) return;

    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const itemUuid = rollContext?.itemUuid ?? null;
    const item = itemUuid && typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(itemUuid) : null;
    if (!getPowerEvents(item).length) return;

    const canAct = Boolean(game.user?.isGM || message?.isOwner || message?.author?.isOwner || message?.user?.isOwner);
    if (!canAct) return;

    const preview = previewPowerOutcomes(message, { item });
    const automatedOutcomes = preview.targets.flatMap((target) => target.outcomes.filter((entry) => entry.automated));
    const manualOutcomes = preview.targets.flatMap((target) => target.outcomes.filter((entry) => !entry.automated));
    if (!automatedOutcomes.length && !manualOutcomes.length) return;

    const content = html.querySelector(".message-content");
    if (content && preview.targets.length) {
      const summaryLines = preview.targets.map((target) => {
        const label = target.name ?? "Source";
        const parts = target.outcomes.map((entry) => {
          const outcome = entry.outcome ?? {};
          if (outcome.type === "status") return `${outcome.mode === "remove" ? "Remove" : "Apply"} ${outcome.statusId}`;
          if (outcome.type === "remove-status") return `Remove ${outcome.statusId}`;
          if (outcome.type === "active-effect") return outcome.effect?.name ?? "Active Effect";
          if (outcome.type === "manual") return `Manual: ${outcome.label ?? "Resolve manually"}`;
          return outcome.type ?? "Outcome";
        });
        return `<li><strong>${label}:</strong> ${parts.join(", ")}</li>`;
      });
      const preview_ = document.createElement("div");
      preview_.classList.add("marvel-multiverse", "power-event-preview");
      preview_.innerHTML = `<ul class="power-event-preview__list">${summaryLines.join("")}</ul>`;
      content.appendChild(preview_);
    }

    const container = document.createElement("div");
    container.classList.add("marvel-multiverse", "power-event-actions", "action-panel", "compact-inline");
    const applyLabel = game.i18n.localize("MARVEL_MULTIVERSE.ApplyPowerOutcomes") || "Apply Power Outcomes";
    const undoLabel = game.i18n.localize("MARVEL_MULTIVERSE.UndoPowerOutcomes") || "Undo Power Outcomes";
    container.innerHTML = `
      <button type="button" class="action-button primary" data-action="applyPowerOutcomes"><i class="fas fa-bolt-lightning"></i><span>${applyLabel}</span></button>
      <button type="button" class="action-button secondary" data-action="undoPowerOutcomes"><i class="fas fa-rotate-left"></i><span>${undoLabel}</span></button>
    `;
    this._prepareActionButtons(container);
    buttonGroup.appendChild(container);

    for (const button of container.querySelectorAll("button[data-action]")) {
      button.addEventListener("click", (event) => this._onPowerEventActionButton(event, message, item));
    }
  }

  async _onPowerEventActionButton(event, message, item) {
    event.stopPropagation();
    const action = event.currentTarget.dataset.action;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (action === "applyPowerOutcomes") {
        await this._handleApplyPowerOutcomes(message, button, item);
      } else if (action === "undoPowerOutcomes") {
        await this._handleUndoPowerOutcomes(message, button);
      }
    } finally {
      button.disabled = false;
    }
  }

  async _handleApplyPowerOutcomes(message, button, item) {
    const result = await applyPowerOutcomes(message, { item });
    if (result?.success) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.PowerOutcomesApplied") || "Power Outcomes Applied";
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.PowerOutcomesApplied") || "Power outcomes applied.");
      return;
    }
    ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.PowerOutcomesApplyFailed") || "No power outcomes could be applied.");
  }

  async _handleUndoPowerOutcomes(message, button) {
    const result = await undoPowerOutcomes(message, {});
    if (result?.success) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.PowerOutcomesUndone") || "Power Outcomes Undone";
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.PowerOutcomesUndone") || "Power outcomes undone.");
      return;
    }
    ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.PowerOutcomesUndoFailed") || "Nothing to undo.");
  }

  _renderConsumedFutureRollModifierActions(html) {
    const buttonGroup = resolveChatActionContainer(html);
    if (!buttonGroup) return;
    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    const message = messageId ? game.messages.get(messageId) : null;
    const consumed = message?.getFlag?.("marvel-multiverse", "consumedFutureRollModifiers") ?? [];
    if (!Array.isArray(consumed) || !consumed.some((entry) => !entry?.restored)) return;
    if (!game.user?.isGM && !message?.isOwner) return;

    const container = document.createElement("div");
    container.classList.add("marvel-multiverse", "future-roll-modifier-actions", "action-panel", "compact-inline");
    container.innerHTML = '<button type="button" class="action-button secondary" data-action="restoreFutureRollModifier"><i class="fas fa-rotate-left"></i><span>Restore Used Modifier</span></button>';
    this._prepareActionButtons(container);
    buttonGroup.appendChild(container);
    container.querySelector("button").addEventListener("click", async (event) => {
      event.stopPropagation();
      const button = event.currentTarget;
      button.disabled = true;
      const result = await restoreConsumedFutureRollModifiers(message);
      if (result.success) {
        button.remove();
        ui.notifications.info("The one-use roll modifier was restored.");
      } else {
        button.disabled = false;
        ui.notifications.warn("The one-use roll modifier could not be restored.");
      }
    });
  }

  async _handleStartConcentration(message, button) {
    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const utilityActivation = message.getFlag("marvel-multiverse", "utilityActivation") ?? null;
    const actorUuid = rollContext?.actorUuid ?? null;
    if (!actorUuid) return;
    const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(actorUuid) : null;
    const actorRecord = actor?.actor ?? actor;
    if (!actorRecord) return;
    const sourceItem = rollContext?.itemUuid && typeof globalThis.fromUuidSync === "function"
      ? globalThis.fromUuidSync(rollContext.itemUuid)
      : null;
    const focusCost = parseFocusCost(sourceItem?.system?.cost ?? rollContext?.source?.costText ?? null);
    const eventTransactions = message.getFlag("marvel-multiverse", "resolution")?.eventTransactions ?? [];
    const result = await startConcentration(actorRecord, {
      message,
      itemName: rollContext?.source?.itemName ?? actorRecord.name,
      itemUuid: rollContext?.itemUuid ?? null,
      targetUuids: Array.isArray(rollContext?.targetUuids) ? rollContext.targetUuids : [],
      statusTransactionIds: eventTransactions
        .filter((transaction) => !transaction?.undone && transaction?.duration?.type === "concentration")
        .map((transaction) => transaction.id),
      concentrationStatus: utilityActivation?.concentrationStatus ?? null,
      concentrationStatusActorUuids: Array.isArray(utilityActivation?.concentrationStatusActorUuids)
        ? utilityActivation.concentrationStatusActorUuids
        : [],
      regionUuids: Array.isArray(rollContext?.areaRegionUuids) ? rollContext.areaRegionUuids : [],
      maintenance: focusCost?.valid && focusCost.cadence === "turn"
        ? { resource: "focus", amount: focusCost.value, cadence: "turn", timing: "start-of-subsequent-turn" }
        : null,
    });
    if (result?.success) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.ConcentrationStarted") || "Concentration started";
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.ConcentrationStarted") || "Concentration started.");
    }
  }

  async _handleEndConcentration(message, button) {
    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const actorUuid = rollContext?.actorUuid ?? null;
    if (!actorUuid) return;
    const actor = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(actorUuid) : null;
    const actorRecord = actor?.actor ?? actor;
    if (!actorRecord) return;
    const result = await endConcentration(actorRecord, { reason: "chat-action" });
    if (result?.success) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.ConcentrationEnded") || "Concentration ended";
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.ConcentrationEnded") || "Concentration ended.");
    }
  }

  _renderEscapeActionButtons(html) {
    const buttonGroup = resolveChatActionContainer(html);
    if (!buttonGroup) return;

    const messageId = html.closest("[data-message-id]")?.dataset?.messageId;
    if (!messageId) return;

    const message = game.messages.get(messageId);
    if (!message) return;

    const transactions = message.getFlag("marvel-multiverse", "statusTransactions") ?? [];
    if (!Array.isArray(transactions) || !transactions.length) return;

    const actions = [];
    for (const transaction of transactions) {
      const entries = getEscapeActionEntries(message, transaction.id) ?? [];
      for (const entry of entries) {
        const actor = typeof globalThis.fromUuidSync === "function"
          ? globalThis.fromUuidSync(entry.targetUuid)
          : null;
        const actorRecord = actor?.actor ?? actor;
        const canAct = Boolean(game.user?.isGM || actorRecord?.isOwner || actorRecord?.owner);
        if (!canAct) continue;
        actions.push({
          action: "rollEscape",
          targetUuid: entry.targetUuid,
          transactionId: entry.transactionId,
          label: entry.label,
        });
      }
    }

    if (!actions.length) return;

    const content = html.querySelector(".message-content");
    if (!content) return;

    const summary = document.createElement("div");
    summary.classList.add("marvel-multiverse", "escape-summary");
    summary.innerHTML = `<div class="escape-summary-title"><span class="escape-badge"><i class="fas fa-unlock"></i></span> ${game.i18n.localize("MARVEL_MULTIVERSE.EscapeActions") || "Escape Actions"}</div>`;
    content.appendChild(summary);

    const container = document.createElement("div");
    container.classList.add("marvel-multiverse", "escape-actions", "action-panel");
    container.innerHTML = actions.map(({ action, label, transactionId, targetUuid }) => `<button type="button" class="action-button primary" data-action="${action}" data-status-transaction-id="${transactionId}" data-target-uuid="${targetUuid}"><i class="fas fa-unlock"></i><span>${label}</span></button>`).join("");
    this._prepareActionButtons(container);
    summary.appendChild(container);

    for (const button of container.querySelectorAll("button[data-action]")) {
      button.addEventListener("click", (event) => this._onEscapeActionButton(event, message));
    }
  }

  async _onEscapeActionButton(event, message) {
    event.stopPropagation();
    const button = event.currentTarget;
    const transactionId = button.dataset.statusTransactionId;
    const targetUuid = button.dataset.targetUuid;
    button.disabled = true;
    try {
      await this._handleRollEscape(message, transactionId, targetUuid, button);
    } finally {
      button.disabled = false;
    }
  }

  async _handleRollEscape(message, transactionId, targetUuid, button) {
    const amount = await promptDialog({
      title: game.i18n.localize("MARVEL_MULTIVERSE.RollEscape") || "Roll Escape",
      content: `<p><label>${game.i18n.localize("MARVEL_MULTIVERSE.EnterRollTotal") || "Enter roll total"}</label><input type="number" min="0" step="1" value="0" /></p>`,
      callback: (root) => {
        const value = Number(root.querySelector("input").value);
        return Number.isFinite(value) && value >= 0 ? value : null;
      },
    });
    if (amount === null || Number.isNaN(amount) || !Number.isFinite(amount) || amount < 0) return;

    const result = await rollEscapeCheck(message, {
      statusTransactionId: transactionId,
      targetUuid,
      userId: game.user?.id ?? null,
      rollResult: { total: amount, marvelDieResult: null, isFantastic: false },
    });

    if (result?.escapeSucceeded) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.EscapeSucceeded") || "Escaped";
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.EscapeSucceeded") || "Escape succeeded.");
      return;
    }

    button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.EscapeFailed") || "Escape failed";
    ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.EscapeFailed") || "Escape failed.");
  }

  async _onFocusActionButton(event, message) {
    event.stopPropagation();
    const action = event.currentTarget.dataset.action;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (action === "spendFocus") {
        await this._handleSpendFocus(message, button);
      } else if (action === "chooseFocusCost") {
        await this._handleChooseFocusCost(message, button);
      } else if (action === "customFocus") {
        await this._handleCustomFocus(message, button);
      } else if (action === "refundFocus") {
        await this._handleRefundFocus(message, button);
      }
    } finally {
      button.disabled = false;
    }
  }

  async _handleSpendFocus(message, button) {
    const result = await spendMessageFocus(message, { quiet: true });
    if (result?.success) {
      button.textContent = `${game.i18n.localize("MARVEL_MULTIVERSE.FocusPaid") || "Focus Paid"}: ${result.appliedAmount ?? 0}`;
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.FocusSpent") || "Spent Focus.");
      return;
    }
    ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.FocusSpendFailed") || "Focus spend failed.");
  }

  async _handleChooseFocusCost(message, button) {
    const rollContext = message.getFlag("marvel-multiverse", "rollContext") ?? null;
    const costContext = this._resolveFocusCostContext(message, rollContext);
    const minimum = typeof costContext?.minimum === "number" ? costContext.minimum : 0;
    const maximum = typeof costContext?.maximum === "number" ? costContext.maximum : null;
    const amount = await promptDialog({
      title: game.i18n.localize("MARVEL_MULTIVERSE.ChooseFocusCost") || "Choose Focus Cost",
      content: `<p><label>${game.i18n.localize("MARVEL_MULTIVERSE.EnterAmount") || "Enter amount"}</label><input type="number" min="${minimum}" step="1" value="${minimum}" /></p>`,
      callback: (root) => {
        const value = Number(root.querySelector("input").value);
        return Number.isFinite(value) && Number.isInteger(value) ? value : null;
      },
    });
    if (amount === null || Number.isNaN(amount) || !Number.isInteger(amount) || amount < minimum || (maximum !== null && amount > maximum)) return;
    const result = await spendMessageFocus(message, { amount, quiet: true });
    if (result?.success) {
      button.textContent = `${game.i18n.localize("MARVEL_MULTIVERSE.FocusPaid") || "Focus Paid"}: ${result.appliedAmount ?? amount}`;
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.FocusSpent") || "Spent Focus.");
      return;
    }
    ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.FocusSpendFailed") || "Focus spend failed.");
  }

  async _handleCustomFocus(message, button) {
    const amount = await promptDialog({
      title: game.i18n.localize("MARVEL_MULTIVERSE.SpendCustomFocus") || "Spend Custom Focus",
      content: `<p><label>${game.i18n.localize("MARVEL_MULTIVERSE.EnterAmount") || "Enter amount"}</label><input type="number" min="0" step="1" value="0" /></p>`,
      callback: (root) => {
        const value = Number(root.querySelector("input").value);
        return Number.isFinite(value) && Number.isInteger(value) ? value : null;
      },
    });
    if (amount === null || Number.isNaN(amount) || !Number.isInteger(amount) || amount < 0) return;
    const result = await spendMessageFocus(message, { amount, quiet: true, custom: true });
    if (result?.success) {
      button.textContent = `${game.i18n.localize("MARVEL_MULTIVERSE.FocusPaid") || "Focus Paid"}: ${result.appliedAmount ?? amount}`;
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.FocusSpent") || "Spent Focus.");
      return;
    }
    ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.FocusSpendFailed") || "Focus spend failed.");
  }

  async _handleRefundFocus(message, button) {
    const result = await refundMessageFocus(message, { quiet: true });
    if (result?.success) {
      button.textContent = game.i18n.localize("MARVEL_MULTIVERSE.FocusRefunded") || "Focus Refunded";
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.FocusRefunded") || "Refunded Focus.");
      return;
    }
    ui.notifications.warn(result?.issues?.[0]?.message || game.i18n.localize("MARVEL_MULTIVERSE.FocusRefundFailed") || "Focus refund failed.");
  }

  async _onDamageActionButton(event, message) {
    event.stopPropagation();
    const action = event.currentTarget.dataset.action;
    const mode = event.currentTarget.dataset.damageMode;
    if (action === "resolveAction") {
      await this._handleResolveAction(message, event.currentTarget);
      return;
    }
    if (action === "undoDamage") {
      await this._handleUndoDamage(message);
      return;
    }
    if (action === "applyCustomDamage") {
      const amount = await promptDialog({
        title: game.i18n.localize("MARVEL_MULTIVERSE.CustomDamage") || "Custom Damage",
        content: `<p><label>${game.i18n.localize("MARVEL_MULTIVERSE.EnterAmount") || "Enter damage amount"}</label><input type="number" min="0" step="1" /></p>`,
        callback: (root) => Number(root.querySelector("input").value),
      });
      if (amount === null || Number.isNaN(amount) || !Number.isInteger(amount) || amount < 0) return;
      const customResult = await requestApplyMessageDamage(message.id, { mode: "custom", amount });
      if (customResult?.success && customResult?.transactionId && getGuidedResolutionState(message)) {
        await markGuidedResolutionApplied(message, { transactionId: customResult.transactionId });
      }
      return;
    }
    const damageResult = await requestApplyMessageDamage(message.id, { mode });
    if (damageResult?.success && damageResult?.transactionId && getGuidedResolutionState(message)) {
      await markGuidedResolutionApplied(message, { transactionId: damageResult.transactionId });
    }
  }

  async _handleUndoDamage(message) {
    const applications = getDamageApplications(message);
    const transaction = applications.slice().reverse().find((entry) => !entry.undone);
    if (!transaction) {
      ui.notifications.warn(game.i18n.localize("MARVEL_MULTIVERSE.NoDamageToUndo") || "No damage to undo.");
      return;
    }
    const result = await requestUndoMessageDamage(message.id);
    if (result?.success) {
      if (getGuidedResolutionState(message)) {
        await markGuidedResolutionUndone(message, { transactionId: result.transactionId ?? transaction.id });
      }
      ui.notifications.info(game.i18n.localize("MARVEL_MULTIVERSE.UndoDamageRequested") || "Undo requested.");
      return;
    }
    ui.notifications.warn(game.i18n.localize("MARVEL_MULTIVERSE.UndoDamageFailed") || "Undo failed.");
  }

  _onClickDamageButton(event) {
    event?.stopPropagation?.();
    const messageId = event?.currentTarget?.closest?.("[data-message-id]")?.dataset?.messageId;
    const message = typeof messageId === "string" && messageId
      ? game.messages.get(messageId)
      : this;
    if (!message) return;
    const action = event?.currentTarget?.dataset?.action;
    if (action === "undoDamage") {
      return this._handleUndoDamage(message);
    }
    if (action === "applyCustomDamage") {
      return this._handleCustomDamagePrompt(message);
    }
    return this._onDamageActionButton(event, message);
  }

  async _handleCustomDamagePrompt(message) {
    const amount = await promptDialog({
      title: game.i18n.localize("MARVEL_MULTIVERSE.CustomDamage") || "Custom Damage",
      content: `<p><label>${game.i18n.localize("MARVEL_MULTIVERSE.EnterAmount") || "Enter damage amount"}</label><input type="number" min="0" step="1" /></p>`,
      callback: (root) => Number(root.querySelector("input").value),
    });
    if (amount === null || Number.isNaN(amount) || !Number.isInteger(amount) || amount < 0) return;
    const customResult = await requestApplyMessageDamage(message.id, { mode: "custom", amount });
    if (customResult?.success && customResult?.transactionId && getGuidedResolutionState(message)) {
      await markGuidedResolutionApplied(message, { transactionId: customResult.transactionId });
    }
  }

  /**
   * Handle clicking a retro button.
   * @param {PointerEvent} event      The initiating click event.
   */
  _onClickRetroButton(event) {
    event.stopPropagation();
    const eventTarget = event.currentTarget;

    const action = eventTarget.dataset.retroAction;
    const isInit = eventTarget.dataset.initiative;
    const dieIndex = Math.round(eventTarget.dataset.index);
    const messageId =
      eventTarget.closest("[data-message-id]").dataset.messageId;

    const messageHeader = eventTarget.closest("li.chat-message");
    const flavorText =
      messageHeader.querySelector("span.flavor-text")?.innerHTML;
    this._handleChatButton(action, messageId, dieIndex, isInit, flavorText);
  }

  async _handleEdge(active, rollResult) {
    if (active) {
      rollResult.active = true;
      rollResult.discarded = undefined;
    } else {
      rollResult.active = false;
      rollResult.discarded = true;
    }
  }

  /**
   * Handles our button clicks from the chat log
   * @param {string} action
   * @param {string} messageId
   * @param {number} dieIndex
   */
  async _handleChatButton(action, messageId, dieIndex, isInit, flavor) {
    if (!action || !messageId) throw new Error("Missing Information");

    const chatMessage = game.messages.get(messageId);
    const previousRollContext = chatMessage?.getFlag?.("marvel-multiverse", "rollContext") ?? null;
    const modifier = action === "edge" ? "kh" : "kl";
    const [roll] = chatMessage.rolls;
    const firstRollTerm = roll.terms[0];

    let rollTerm;

    if (
      firstRollTerm instanceof foundry.dice.terms.ParentheticalTerm &&
      firstRollTerm.roll.terms[0] instanceof foundry.dice.terms.PoolTerm
    ) {
      rollTerm = firstRollTerm.roll.terms[0];
    } else if (firstRollTerm instanceof foundry.dice.terms.PoolTerm) {
      rollTerm = firstRollTerm;
    }

    if (
      !(
        rollTerm.rolls.length === 3 &&
        rollTerm.rolls[1].terms[0] instanceof
          game.MarvelMultiverse.dice.MarvelDie
      )
    )
      return;

    const targetRoll = rollTerm.rolls[dieIndex];
    const targetDie = targetRoll.terms[0];
    const targetIsMarvel =
      targetDie instanceof game.MarvelMultiverse.dice.MarvelDie;
    const formulaReg = /(?<number>\d)d(?<dieType>\d|m).*/;
    const formulaGroups = formulaReg.exec(targetRoll._formula)?.groups;

    const formulaDie = formulaGroups.dieType;

    targetDie.number = 2;

    const targetFormula = `${targetDie.number}d${formulaDie}`;

    targetRoll._formula = `${targetFormula}${modifier}`;

    rollTerm.terms[dieIndex] = targetRoll._formula;

    targetDie.modifiers = [modifier];

    const oldRollResult = targetDie.results.find((r) => r.active);
    const oldFantastic = targetIsMarvel && oldRollResult.result === 1;
    const oldResult =
      targetIsMarvel && oldRollResult.result === 1 ? 6 : oldRollResult.result;

    const newRoll = new CONFIG.Dice.MarvelMultiverseRoll(targetRoll._formula, {
      ...targetRoll.data,
    });
    await newRoll.roll();

    const newRollResult = newRoll.terms[0].results[0];
    const newFantastic = targetIsMarvel && newRollResult.result === 1;
    const newResult =
      targetIsMarvel && newRollResult.result === 1 ? 6 : newRollResult.result;

    if (modifier === "kh") {
      if (newFantastic || newResult >= oldResult) {
        this._handleEdge(false, oldRollResult);
        this._handleEdge(true, newRollResult);
      } else if (oldFantastic || oldResult >= newResult) {
        this._handleEdge(false, newRollResult);
      }
    } else if (modifier === "kl") {
      if (newFantastic) {
        this._handleEdge(false, newRollResult);
        this._handleEdge(true, oldRollResult);
      } else if (newResult <= oldResult) {
        this._handleEdge(false, oldRollResult);
        this._handleEdge(true, newRollResult);
      } else if (newResult > oldResult) {
        this._handleEdge(false, newRollResult);
        this._handleEdge(true, oldRollResult);
      }
    }

    targetDie.results.push(newRollResult);

    const re = /(\(?{)(\dd\d),(\ddm),(\dd\d)(}.*)/;

    let replacedFormula;
    switch (dieIndex) {
      case 0: {
        replacedFormula = roll.formula.replace(
          re,
          `$1${targetDie.number}d6${modifier},$3,$4$5`
        );
        break;
      }
      case 1: {
        replacedFormula = roll.formula.replace(
          re,
          `$1$2,${targetDie.number}dm${modifier},$4$5`
        );
        break;
      }
      case 2: {
        replacedFormula = roll.formula.replace(
          re,
          `$1$2,$3,${targetDie.number}d6${modifier}$5`
        );
        break;
      }
    }

    roll._formula = replacedFormula;

    if (newRollResult.active) {
      roll._total = roll.total - oldResult + newResult;
    }

    let update = await roll.toMessage({ flavor: flavor }, {
      create: false,
      actor: game.actors.get(chatMessage?.speaker?.actor) ?? chatMessage?.actor ?? null,
      token: chatMessage?.token ?? null,
      item: null,
      rollType: "ability",
      targets: [],
      userId: chatMessage?.user?.id ?? game.user?.id,
    });
    update = foundry.utils.mergeObject(chatMessage.toJSON(), update);

    if (isInit) {
      const speakerActorId = chatMessage?.speaker?.actor ?? null;
      const combatant = speakerActorId
        ? game.combat?.combatants?.contents?.find(
            (entry) => entry.actorId === speakerActorId
          )
        : null;
      if (combatant) {
        await combatant.update({ initiative: roll.total });
      }
    }

    const updatedMessage = await chatMessage.update(update);
    const activeMessage = updatedMessage ?? game.messages.get(messageId) ?? chatMessage;

    const updatedRollContext = {
      ...(previousRollContext ?? {}),
      rollTotal: typeof roll.total === "number" ? roll.total : previousRollContext?.rollTotal ?? null,
      marvelDieResult: roll?.dice?.[1]?.result ?? previousRollContext?.marvelDieResult ?? null,
      isFantastic: typeof roll.isFantastic === "boolean" ? roll.isFantastic : previousRollContext?.isFantastic ?? null,
      hasEdge: action === "edge" ? true : previousRollContext?.hasEdge ?? null,
      hasTrouble: action === "trouble" ? true : previousRollContext?.hasTrouble ?? null,
      timestamp: Date.now(),
    };

    await updateChatMessageFlags(activeMessage, {
      "marvel-multiverse": {
        rollContext: updatedRollContext,
      },
    });

    if (updatedRollContext.rollType === "attack") {
      const refreshedAttack = await refreshAttackResolution(activeMessage, { quiet: true, store: true });
      const nextAttackResolution = refreshedAttack?.after ?? refreshedAttack ?? null;
      if (nextAttackResolution) {
        await updateChatMessageFlags(activeMessage, {
          "marvel-multiverse": {
            attackResolution: nextAttackResolution,
          },
        });
      }
    }

    if (updatedRollContext.dealsDamage) {
      const refreshedDamage = await refreshDamageContext(activeMessage, { quiet: true });
      const nextDamageContext = refreshedDamage?.after ?? refreshedDamage ?? null;
      if (nextDamageContext) {
        await updateChatMessageFlags(activeMessage, {
          "marvel-multiverse": {
            damageContext: nextDamageContext,
          },
        });
      }
    }

    return activeMessage;
  }

  /* -------------------------------------------- */
  /**
   * Wait to apply appropriate element heights until after the chat log has completed its initial batch render.
   * @param {jQuery} html  The chat log HTML.
   */
  static onRenderChatLog(html) {
  }
}

// Sheet behavior has been moved to the extracted module at ./lib/sheets.mjs.

globalThis.MarvelMultiverse = {
  MarvelMultiverseActor: DocumentMarvelMultiverseActor,
  MarvelMultiverseItem: DocumentMarvelMultiverseItem,
  rollItemMacro,
  config: MARVEL_MULTIVERSE,
  dice: documentDice,
  models: documentModels,
  MarvelMultiverseCharacterSheet,
  MarvelMultiverseModernCharacterSheet,
  MarvelMultiverseNPCSheet,
  MarvelMultiverseItemSheet,
  ChatMessageMarvel,
  getConditionRollModifiers,
  validateCharacterActor,
  validatePowerItem,
  validateEmbeddedItem,
  validateActiveEffect,
  validateDocument,
  logValidationResult,
  normalizePowerData,
  normalizeActorData,
  normalizeItemData,
  normalizeCharacterData,
  previewNormalization,
  applyNormalization,
  logNormalizationPreview,
};

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

registerSystemHooks({
  initializeSystem,
  MARVEL_MULTIVERSE,
  ChatMessageMarvel,
  DocumentMarvelMultiverseRoll,
  DocumentMarvelMultiverseCombatant,
  DocumentMarvelMultiverseActor,
  DocumentMarvelMultiverseItem,
  DocumentMarvelMultiverseGear: documentModels.MarvelMultiverseItem,
  DocumentMarvelMultiverseCharacter,
  DocumentMarvelMultiverseNPC,
  DocumentMarvelMultiverseWeapon,
  DocumentMarvelMultiverseTrait,
  DocumentMarvelMultiverseOrigin,
  DocumentMarvelMultiverseOccupation,
  DocumentMarvelMultiverseTag,
  DocumentMarvelMultiversePower,
  DocumentMarvelDie,
  CharacterSheetClass: MarvelMultiverseCharacterSheet,
  ModernCharacterSheetClass: MarvelMultiverseModernCharacterSheet,
  ComicCharacterSheetClass: MarvelMultiverseComicCharacterSheet,
  NPCSheetClass: MarvelMultiverseNPCSheet,
  ItemSheetClass: MarvelMultiverseItemSheet,
  version: MarvelMultiverse.version,
  ASCII: MARVEL_MULTIVERSE.ASCII,
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

Handlebars.registerHelper("toLowerCase", (mle) => mle.toLowerCase());

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: "Item",
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Trigger the item roll
    item.roll();
  });
}

export { ChatMessageMarvel, MARVEL_MULTIVERSE, DocumentMarvelMultiverseActor as MarvelMultiverseActor, MarvelMultiverseCharacterSheet, MarvelMultiverseModernCharacterSheet, DocumentMarvelMultiverseItem as MarvelMultiverseItem, MarvelMultiverseItemSheet, MarvelMultiverseNPCSheet, documentDice as dice, documentModels as models, rollItemMacro };

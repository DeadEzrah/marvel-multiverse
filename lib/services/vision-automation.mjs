import { promptDialog } from "./dialog-compat.mjs";
import { getActorConditionKeys } from "../conditions.mjs";

const SYSTEM_ID = "marvel-multiverse";
const VISION_VERSION = 2;
const PERSONAL_VISION_FEET = 5;
const DEFAULT_ENHANCED_RANGE_FEET = 60;
const VISION_MODES = Object.freeze({
  basic: "Basic Vision",
  darkvision: "Darkvision",
  lightAmplification: "Light Amplification",
  monochromatic: "Monochromatic Vision",
  tremorsense: "Tremorsense / Radar Sense",
});
const LIGHT_MODES = Object.freeze(["none", "personal", "torch", "flashlight"]);

function resolveRoot(html) {
  return html?.querySelector ? html : html?.[0] ?? null;
}

function normalizeUnits(units) {
  return String(units ?? "").trim().toLowerCase();
}

export function feetToSceneUnits(feet, scene = globalThis.canvas?.scene) {
  const value = Math.max(0, Number(feet) || 0);
  const units = normalizeUnits(scene?.grid?.units);
  if (["m", "meter", "meters", "metre", "metres"].includes(units)) return value * 0.3048;
  if (["km", "kilometer", "kilometers", "kilometre", "kilometres"].includes(units)) return value * 0.0003048;
  if (["yd", "yard", "yards"].includes(units)) return value / 3;
  if (["mi", "mile", "miles"].includes(units)) return value / 5280;
  return value;
}

export function sceneUnitsToFeet(distance, scene = globalThis.canvas?.scene) {
  const value = Math.max(0, Number(distance) || 0);
  const units = normalizeUnits(scene?.grid?.units);
  if (["m", "meter", "meters", "metre", "metres"].includes(units)) return value / 0.3048;
  if (["km", "kilometer", "kilometers", "kilometre", "kilometres"].includes(units)) return value / 0.0003048;
  if (["yd", "yard", "yards"].includes(units)) return value * 3;
  if (["mi", "mile", "miles"].includes(units)) return value * 5280;
  return value;
}

function getLightData(mode, scene) {
  const ranges = {
    none: { bright: 0, dim: 0 },
    personal: { bright: 0, dim: PERSONAL_VISION_FEET },
    torch: { bright: 20, dim: 40 },
    flashlight: { bright: 30, dim: 60 },
  }[mode] ?? { bright: 0, dim: PERSONAL_VISION_FEET };
  const common = {
    bright: feetToSceneUnits(ranges.bright, scene),
    dim: feetToSceneUnits(ranges.dim, scene),
    darkness: { min: 0, max: 1 },
  };
  if (mode === "torch") {
    return {
      ...common,
      angle: 360,
      alpha: 0.35,
      color: "#f6b85f",
      luminosity: 0.5,
      animation: { type: "torch", speed: 2, intensity: 3, reverse: false },
    };
  }
  if (mode === "flashlight") {
    return {
      ...common,
      angle: 60,
      alpha: 0.25,
      color: "#f4f7ff",
      luminosity: 0.7,
      animation: { type: null, speed: 5, intensity: 5, reverse: false },
    };
  }
  return {
    ...common,
    angle: 360,
    alpha: 0.15,
    color: "#ffffff",
    luminosity: 0.1,
    animation: { type: null, speed: 5, intensity: 5, reverse: false },
  };
}

function isSupportedActor(actor) {
  return actor?.type === "character" || actor?.type === "npc";
}

function isBlinded(actor) {
  return getActorConditionKeys(actor).includes("blinded");
}

function hasPlayerOwner(actor) {
  return actor?.hasPlayerOwner === true;
}

function hasOwnedItem(actor, name) {
  const normalizedName = String(name).trim().toLowerCase();
  return Array.from(actor?.items ?? []).some((item) => String(item?.name ?? "").trim().toLowerCase() === normalizedName);
}

export function resolveActorVisionProfile(actor) {
  const explicitProfile = actor?.getFlag?.(SYSTEM_ID, "vision.profile")
    ?? actor?.flags?.[SYSTEM_ID]?.vision?.profile
    ?? null;
  if (explicitProfile === "radar-sense") {
    return { mode: "tremorsense", rangeFeet: DEFAULT_ENHANCED_RANGE_FEET, source: "radar-sense" };
  }
  if (hasOwnedItem(actor, "Vision Issues") && hasOwnedItem(actor, "Heightened Senses 2")) {
    return { mode: "tremorsense", rangeFeet: DEFAULT_ENHANCED_RANGE_FEET, source: "radar-sense" };
  }
  return null;
}

function getVisionFlag(document, key) {
  return document?.getFlag?.(SYSTEM_ID, `vision.${key}`)
    ?? document?.flags?.[SYSTEM_ID]?.vision?.[key]
    ?? null;
}

function getTokenDocument(token) {
  return token?.document ?? token ?? null;
}

function getTokenActor(token) {
  return token?.actor ?? token?.document?.actor ?? null;
}

function canUpdateToken(document) {
  return Boolean(globalThis.game?.user?.isGM || document?.isOwner);
}

function hasCustomLight(document) {
  return (Number(document?.light?.bright) || 0) > 0 || (Number(document?.light?.dim) || 0) > 0;
}

export async function ensureTokenVision(token, options = {}) {
  const document = getTokenDocument(token);
  const actor = getTokenActor(token);
  if (!document?.update || !isSupportedActor(actor) || !canUpdateToken(document)) return false;
  const manualOverride = getVisionFlag(document, "profile") === "manual";
  const profile = manualOverride ? null : resolveActorVisionProfile(actor);
  const storedProfile = getVisionFlag(document, "profile");
  const versionCurrent = Number(getVisionFlag(document, "version")) >= VISION_VERSION;
  if (versionCurrent && options.force !== true && (manualOverride || storedProfile === profile?.source)) return false;

  const visionMode = profile?.mode ?? document.sight?.visionMode;
  const lightMode = getVisionFlag(document, "lightMode");
  const changes = {
    "flags.marvel-multiverse.vision.version": VISION_VERSION,
  };
  if (!isBlinded(actor) || visionMode === "tremorsense") changes["sight.enabled"] = true;
  if (profile) {
    changes["sight.visionMode"] = profile.mode;
    changes["sight.range"] = feetToSceneUnits(profile.rangeFeet, document.parent);
    changes["flags.marvel-multiverse.vision.profile"] = profile.source;
  } else if (!Object.hasOwn(VISION_MODES, visionMode)) {
    changes["sight.visionMode"] = "basic";
  }
  if (visionMode === "tremorsense" && lightMode === "personal") {
    Object.assign(changes, {
      light: getLightData("none", document.parent),
      "flags.marvel-multiverse.vision.lightMode": "none",
    });
  } else if (hasPlayerOwner(actor) && !isBlinded(actor) && visionMode !== "tremorsense" && !hasCustomLight(document)) {
    Object.assign(changes, {
      light: getLightData("personal", document.parent),
      "flags.marvel-multiverse.vision.lightMode": "personal",
    });
  }
  await document.update(changes);
  return true;
}

export async function applyVisionMode(token, mode, rangeFeet = DEFAULT_ENHANCED_RANGE_FEET) {
  const document = getTokenDocument(token);
  if (!document?.update || !canUpdateToken(document) || !Object.hasOwn(VISION_MODES, mode)) return false;
  const actor = getTokenActor(document);
  const lightMode = getVisionFlag(document, "lightMode");
  const range = mode === "basic" ? 0 : feetToSceneUnits(rangeFeet, document.parent);
  const changes = {
    "sight.visionMode": mode,
    "sight.range": range,
    "flags.marvel-multiverse.vision.version": VISION_VERSION,
    "flags.marvel-multiverse.vision.profile": "manual",
  };
  if (mode === "tremorsense" || !isBlinded(actor)) changes["sight.enabled"] = true;
  if (mode === "tremorsense" && lightMode === "personal") {
    Object.assign(changes, {
      light: getLightData("none", document.parent),
      "flags.marvel-multiverse.vision.lightMode": "none",
    });
  } else if (mode === "basic" && hasPlayerOwner(actor) && !isBlinded(actor) && lightMode === "none") {
    Object.assign(changes, {
      light: getLightData("personal", document.parent),
      "flags.marvel-multiverse.vision.lightMode": "personal",
    });
  }
  await document.update(changes);
  return true;
}

export async function applyLightMode(token, mode) {
  const document = getTokenDocument(token);
  if (!document?.update || !canUpdateToken(document) || !LIGHT_MODES.includes(mode)) return false;
  if (mode === "personal" && (isBlinded(getTokenActor(document)) || document.sight?.visionMode === "tremorsense")) return false;
  await document.update({
    light: getLightData(mode, document.parent),
    "flags.marvel-multiverse.vision.lightMode": mode,
    "flags.marvel-multiverse.vision.version": VISION_VERSION,
  });
  return true;
}

function buildVisionModeOptions(selected) {
  return Object.entries(VISION_MODES).map(([value, label]) => (
    `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`
  )).join("");
}

export async function openVisionDialog(token) {
  const document = getTokenDocument(token);
  const actor = getTokenActor(token);
  if (!document || !isSupportedActor(actor)) return null;
  const selected = Object.hasOwn(VISION_MODES, document.sight?.visionMode) ? document.sight.visionMode : "basic";
  const currentFeet = sceneUnitsToFeet(document.sight?.range, document.parent);
  const rangeFeet = currentFeet > 0 ? Math.round(currentFeet * 10) / 10 : DEFAULT_ENHANCED_RANGE_FEET;
  return promptDialog({
    title: `${actor.name}: Vision`,
    label: "Apply",
    content: `
      <div class="form-group">
        <label for="mm-vision-mode">Vision Mode</label>
        <select id="mm-vision-mode" name="visionMode">${buildVisionModeOptions(selected)}</select>
      </div>
      <div class="form-group">
        <label for="mm-vision-range">Enhanced Range (feet)</label>
        <input id="mm-vision-range" name="visionRange" type="number" min="5" step="5" value="${rangeFeet}">
        <p class="hint">Basic Vision uses normal map lighting plus five feet of personal vision.</p>
      </div>`,
    callback: async (root) => {
        const dialogRoot = resolveRoot(root);
        const mode = dialogRoot?.querySelector?.("[name='visionMode']")?.value ?? "basic";
        const range = Number(dialogRoot?.querySelector?.("[name='visionRange']")?.value) || DEFAULT_ENHANCED_RANGE_FEET;
      const applied = await applyVisionMode(document, mode, range);
      if (applied) globalThis.ui?.notifications?.info?.(`${actor.name}: ${VISION_MODES[mode]} enabled.`);
      return applied ? { mode, range } : null;
    },
  });
}

function getNextLightMode(document) {
  const current = getVisionFlag(document, "lightMode")
    ?? (document?.sight?.visionMode === "tremorsense" || isBlinded(getTokenActor(document)) ? "none" : "personal");
  if (current === "none" && (document?.sight?.visionMode === "tremorsense" || isBlinded(getTokenActor(document)))) return "torch";
  const index = LIGHT_MODES.indexOf(current);
  return LIGHT_MODES[(index + 1) % LIGHT_MODES.length];
}

async function cycleLightMode(token) {
  const document = getTokenDocument(token);
  const next = getNextLightMode(document);
  const applied = await applyLightMode(document, next);
  if (applied) globalThis.ui?.notifications?.info?.(`${getTokenActor(token)?.name}: ${next === "personal" ? "personal vision" : next} enabled.`);
}

function addHudButton(column, { action, icon, title, onClick }) {
  if (!column || column.querySelector(`[data-action='${action}']`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon";
  button.dataset.action = action;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
  button.addEventListener("click", onClick);
  column.append(button);
}

export function registerVisionAutomationHooks() {
  Hooks.on("renderTokenHUD", (app, html) => {
    const root = resolveRoot(html);
    const token = app.object?.object ?? app.object ?? null;
    const actor = getTokenActor(token);
    if (!root || !isSupportedActor(actor) || !canUpdateToken(getTokenDocument(token))) return;
    const column = root.querySelector(".col.left");
    addHudButton(column, {
      action: "mmVisionMode",
      icon: "fa-eye",
      title: "Configure Vision",
      onClick: () => void openVisionDialog(token),
    });
    const current = getVisionFlag(getTokenDocument(token), "lightMode") ?? "personal";
    const next = getNextLightMode(getTokenDocument(token));
    addHudButton(column, {
      action: "mmLightMode",
      icon: current === "flashlight" ? "fa-flashlight" : "fa-lightbulb",
      title: `Light: ${current}. Click for ${next}.`,
      onClick: () => void cycleLightMode(token),
    });
  });

  Hooks.on("createToken", (document) => {
    void ensureTokenVision(document);
  });

  Hooks.on("canvasReady", (canvas) => {
    if (!globalThis.game?.user?.isGM) return;
    for (const token of canvas?.tokens?.placeables ?? []) void ensureTokenVision(token);
  });
}
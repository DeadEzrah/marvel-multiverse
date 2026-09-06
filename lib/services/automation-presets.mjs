const AUTOMATION_PRESETS = Object.freeze({
  "check.opposed.single": Object.freeze({
    attack: true,
    targeting: Object.freeze({
      required: true,
      count: 1,
    }),
    damage: Object.freeze({
      enabled: false,
    }),
    effectProfiles: Object.freeze({
      attack: "power.psychic.blast",
      hit: "power.psychic.impact",
    }),
  }),
  "attack.single-focus": Object.freeze({
    attack: true,
    damageType: "focus",
    targeting: Object.freeze({
      required: true,
      count: 1,
    }),
    damage: Object.freeze({
      enabled: true,
      type: "focus",
      doubleOnFantastic: true,
    }),
    effectProfiles: Object.freeze({
      hit: "power.psychic.impact",
    }),
  }),
  "attack.ranged.single-blast": Object.freeze({
    attack: true,
    attackKind: "ranged",
    damageType: "health",
    targeting: Object.freeze({
      required: true,
      count: 1,
      requiresLineOfSight: true,
    }),
    damage: Object.freeze({
      enabled: true,
      type: "health",
      doubleOnFantastic: true,
    }),
    effectProfiles: Object.freeze({
      attack: "power.energy.blast",
      hit: "power.energy.impact",
    }),
  }),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergePresetData(defaults, overrides) {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    merged[key] = isPlainObject(value) && isPlainObject(defaults?.[key])
      ? mergePresetData(defaults[key], value)
      : value;
  }
  return merged;
}

export function getAutomationPreset(presetId) {
  const normalized = typeof presetId === "string" ? presetId.trim() : "";
  return normalized ? AUTOMATION_PRESETS[normalized] ?? null : null;
}

export function resolveAutomationSystem(system = {}, options = {}) {
  const presetId = typeof system?.automationPreset === "string" ? system.automationPreset.trim() : "";
  if (!presetId) return system;
  const preset = getAutomationPreset(presetId);
  if (!preset) {
    if (options.warn !== false) console.warn(`Marvel Multiverse | Unknown automation preset: ${presetId}`);
    return system;
  }
  return mergePresetData(preset, system);
}

export function materializeAutomationSource(source, options = {}) {
  if (!source || typeof source !== "object") return source;
  const system = resolveAutomationSystem(source.system ?? source, options);
  if (system === source.system || (!source.system && system === source)) return source;
  const resolved = Object.create(source);
  Object.defineProperty(resolved, "system", { value: system, enumerable: true });
  return resolved;
}

export const automationPresetIds = Object.freeze(Object.keys(AUTOMATION_PRESETS));
import fs from "node:fs";
import path from "node:path";

import { automationPresetIds, getAutomationPreset } from "../lib/services/automation-presets.mjs";
import { EFFECT_PROFILE_PHASES } from "../lib/services/effect-profile-manager.mjs";

const MANIFEST_PATH = "assets/effects-manifest.json";
const PACK_SOURCE_PATH = "packs/_source";
const PROFILE_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const SUPPORTED_PHASES = new Set(EFFECT_PROFILE_PHASES);
const failures = [];
let referenceCount = 0;

function fail(location, message) {
  failures.push(`${location}: ${message}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(filePath, `could not parse JSON (${error.message})`);
    return null;
  }
}

function listJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listJsonFiles(entryPath);
      return entry.isFile() && path.extname(entry.name) === ".json" ? [entryPath] : [];
    });
}

const manifest = readJson(MANIFEST_PATH);
if (!manifest) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const effects = Array.isArray(manifest.effects) ? manifest.effects : [];
if (!Array.isArray(manifest.effects)) fail(MANIFEST_PATH, "effects must be an array");

const effectIds = new Set();
for (const [index, effect] of effects.entries()) {
  const location = `${MANIFEST_PATH}#effects[${index}].id`;
  const profileId = effect?.id;
  if (typeof profileId !== "string" || !PROFILE_ID_PATTERN.test(profileId)) {
    fail(location, `invalid semantic profile ID ${JSON.stringify(profileId)}`);
    continue;
  }
  if (effectIds.has(profileId)) fail(location, `duplicate semantic profile ID "${profileId}"`);
  effectIds.add(profileId);
}

const fallbacks = manifest.fallbacks;
if (!fallbacks || typeof fallbacks !== "object" || Array.isArray(fallbacks)) {
  fail(`${MANIFEST_PATH}#fallbacks`, "fallbacks must be an object");
}
const fallbackEntries = Object.entries(
  fallbacks && typeof fallbacks === "object" && !Array.isArray(fallbacks) ? fallbacks : {},
);
for (const [profileId, targetId] of fallbackEntries) {
  if (!PROFILE_ID_PATTERN.test(profileId)) {
    fail(`${MANIFEST_PATH}#fallbacks.${profileId}`, `invalid alias profile ID "${profileId}"`);
  }
  if (typeof targetId !== "string" || !PROFILE_ID_PATTERN.test(targetId)) {
    fail(`${MANIFEST_PATH}#fallbacks.${profileId}`, `invalid fallback target ${JSON.stringify(targetId)}`);
  }
}

function resolveProfile(profileId) {
  let candidate = profileId;
  const visited = new Set();
  while (candidate && !visited.has(candidate)) {
    visited.add(candidate);
    if (effectIds.has(candidate)) return candidate;
    const configuredFallback = fallbacks?.[candidate];
    if (typeof configuredFallback === "string" && configuredFallback) {
      candidate = configuredFallback;
      continue;
    }
    const separator = candidate.lastIndexOf(".");
    candidate = separator > 0 ? candidate.slice(0, separator) : "";
  }
  return null;
}

function validateReference(profileId, location) {
  referenceCount += 1;
  if (!PROFILE_ID_PATTERN.test(profileId)) {
    fail(location, `invalid semantic profile ID "${profileId}"`);
    return;
  }
  if (!resolveProfile(profileId)) fail(location, `unknown semantic profile "${profileId}"`);
}

for (const [profileId] of fallbackEntries) {
  if (PROFILE_ID_PATTERN.test(profileId) && !resolveProfile(profileId)) {
    fail(`${MANIFEST_PATH}#fallbacks.${profileId}`, `alias "${profileId}" does not resolve to an effect`);
  }
}

function validateProfileDeclarations(value, location) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateProfileDeclarations(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, entry] of Object.entries(value)) {
    const entryLocation = `${location}.${key}`;
    if (key === "effectProfile") {
      if (entry === undefined || entry === null || entry === "") continue;
      if (typeof entry !== "string") {
        fail(entryLocation, "effectProfile must be a string");
      } else {
        validateReference(entry.trim(), entryLocation);
      }
    } else if (key === "effectProfiles") {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        fail(entryLocation, "effectProfiles must be an object");
      } else {
        for (const [phase, profileId] of Object.entries(entry)) {
          const profileLocation = `${entryLocation}.${phase}`;
          if (!SUPPORTED_PHASES.has(phase)) fail(profileLocation, `unknown effect phase "${phase}"`);
          if (typeof profileId !== "string" || !profileId.trim()) {
            fail(profileLocation, "phase profile must be a non-empty string");
          } else {
            validateReference(profileId.trim(), profileLocation);
          }
        }
      }
    }
    validateProfileDeclarations(entry, entryLocation);
  }
}

for (const filePath of listJsonFiles(PACK_SOURCE_PATH)) {
  const source = readJson(filePath);
  if (source) validateProfileDeclarations(source, filePath);
}
for (const presetId of automationPresetIds) {
  validateProfileDeclarations(getAutomationPreset(presetId), `automation preset "${presetId}"`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Effect profiles are valid: ${referenceCount} references, ${effectIds.size} effects, and ${fallbackEntries.length} aliases.`,
);

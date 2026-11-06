// Validates the Sequencer database keys declared in assets/effects-manifest.json
// against the locally installed effect modules:
// - JB2A_DnD5e (free tier): any animation that declares the free module must resolve
//   in the free database, otherwise free-tier users would get a missing-entry error.
// - psfx: every declared sound key must resolve in the PSFX database.
// - jb2a_patreon-only keys cannot be verified offline (the Patreon module ships its
//   database with the paid download), so they are reported as informational only.
//
// The module location defaults to the standard Foundry data path and can be
// overridden with the FOUNDRY_DATA_PATH environment variable. When a module is not
// installed locally its checks are skipped with a warning instead of failing, so the
// script stays safe to run in CI.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MANIFEST_PATH = "assets/effects-manifest.json";

function resolveFoundryDataPath() {
  if (process.env.FOUNDRY_DATA_PATH) return process.env.FOUNDRY_DATA_PATH;
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, "FoundryVTT", "Data");
  return null;
}

function collectDatabaseKeys(node, prefix, keys) {
  keys.add(prefix.toLowerCase());
  if (typeof node !== "object" || node === null) return;
  if (Array.isArray(node)) {
    // Sequencer allows addressing individual entries of a file range by index.
    node.forEach((entry, index) => collectDatabaseKeys(entry, `${prefix}.${index}`, keys));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("_")) continue; // Sequencer metadata (_markers, _templates, ...)
    collectDatabaseKeys(value, `${prefix}.${key}`, keys);
  }
}

async function loadDatabase(modulePath, scriptFile, exportName, builderName) {
  const scriptPath = path.join(modulePath, "scripts", scriptFile);
  if (!fs.existsSync(scriptPath)) return null;
  const module = await import(pathToFileURL(scriptPath));
  await module[builderName]("prefix");
  const keys = new Set();
  for (const [key, value] of Object.entries(module[exportName])) {
    if (key.startsWith("_")) continue;
    collectDatabaseKeys(value, key, keys);
  }
  return keys;
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const references = [];
for (const effect of manifest.effects ?? []) {
  for (const collection of ["animations", "sounds"]) {
    for (const asset of effect[collection] ?? []) {
      if (asset?.kind !== "sequencer-database" || typeof asset.file !== "string") continue;
      references.push({
        effectId: effect.id,
        collection,
        file: asset.file,
        moduleIds: Array.isArray(asset.moduleIds) ? asset.moduleIds : [],
      });
    }
  }
}

const dataPath = resolveFoundryDataPath();
const modulesPath = dataPath ? path.join(dataPath, "modules") : null;
if (!modulesPath || !fs.existsSync(modulesPath)) {
  console.warn("Foundry modules folder not found; skipping Sequencer key validation.");
  process.exit(0);
}

const jb2aFreeKeys = await loadDatabase(
  path.join(modulesPath, "JB2A_DnD5e"), "jb2a_sequencer.js", "freeDatabase", "jb2aFreeDatabase",
);
const psfxKeys = await loadDatabase(
  path.join(modulesPath, "psfx"), "psfx_sequencer.js", "psfxDatabase", "registerPSFXDatabase",
);
if (!jb2aFreeKeys) console.warn("JB2A_DnD5e database not found; skipping free-tier JB2A checks.");
if (!psfxKeys) console.warn("PSFX database not found; skipping PSFX checks.");

const failures = [];
const patreonOnly = [];
let checked = 0;

for (const reference of references) {
  const location = `${reference.effectId} (${reference.collection})`;
  const key = reference.file.toLowerCase();
  if (key.startsWith("jb2a.")) {
    const suffix = key.slice("jb2a.".length);
    if (reference.moduleIds.includes("JB2A_DnD5e")) {
      if (!jb2aFreeKeys) continue;
      checked += 1;
      if (!jb2aFreeKeys.has(suffix)) {
        failures.push(`${location}: "${reference.file}" declares free-tier support but is not in the JB2A free database`);
      }
    } else {
      patreonOnly.push(`${location}: "${reference.file}"`);
    }
  } else if (key.startsWith("psfx.")) {
    if (!psfxKeys) continue;
    checked += 1;
    if (!psfxKeys.has(key.slice("psfx.".length))) {
      failures.push(`${location}: "${reference.file}" is not in the PSFX database`);
    }
  } else {
    failures.push(`${location}: "${reference.file}" uses an unknown Sequencer database namespace`);
  }
}

if (patreonOnly.length) {
  console.log(`Patreon-only keys (not verifiable offline): ${patreonOnly.length}`);
  for (const entry of patreonOnly) console.log(`  ${entry}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Sequencer database keys are valid: ${checked} verified of ${references.length} declared references.`);

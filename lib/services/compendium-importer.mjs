const PACK_TYPE_DEFAULTS = {
  occupations: "occupation",
  origins: "origin",
  powers: "power",
  tags: "tag",
  traits: "trait",
  weapons: "weapon",
  items: "item",
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildObjectReplacement(current, replacement, ForcedDeletion, { deleteMissing = true } = {}) {
  const update = {};

  for (const [key, value] of Object.entries(replacement)) {
    update[key] = isObject(value) && isObject(current?.[key])
      ? buildObjectReplacement(current[key], value, ForcedDeletion)
      : value;
  }

  if (deleteMissing) {
    for (const key of Object.keys(current ?? {})) {
      if (Object.hasOwn(replacement, key)) continue;
      if (ForcedDeletion) update[key] = new ForcedDeletion();
      else update[`-=${key}`] = null;
    }
  }

  return update;
}

export function buildItemUpdateData(existingSystem, document, options = {}) {
  const update = { ...document };
  const replacementSystem = isObject(document?.system) ? document.system : null;
  if (!replacementSystem) return update;

  const ForcedDeletion = options.ForcedDeletion ?? globalThis.foundry?.data?.operators?.ForcedDeletion;
  const currentSystem = isObject(existingSystem) ? existingSystem : {};
  update.system = buildObjectReplacement(currentSystem, replacementSystem, ForcedDeletion, { deleteMissing: false });
  return update;
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function coerceScalar(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
  return value;
}

function setNestedValue(target, dottedPath, value) {
  const parts = String(dottedPath).split(".").filter((part) => part && !["__proto__", "prototype", "constructor"].includes(part));
  if (!parts.length) return;
  if (parts.some((part) => /^\d+$/.test(part))) {
    throw new Error(`CSV system paths cannot address array indexes: ${dottedPath}`);
  }
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isObject(current[part])) current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)] = coerceScalar(value);
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

export function parseCompendiumImportCsv(csvText) {
  const text = String(csvText ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const values = parseCsvLine(line);
    const row = {};

    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i];
      if (!key) continue;
      const rawValue = values[i] ?? "";
      row[key] = coerceScalar(rawValue);
    }

    rows.push(row);
  }

  return rows;
}

function extractSystemData(entry) {
  if (isObject(entry.system)) return { ...entry.system };
  const system = {};

  for (const [key, value] of Object.entries(entry)) {
    if (!key.startsWith("system.")) continue;
    const systemKey = key.slice("system.".length);
    if (!systemKey) continue;
    setNestedValue(system, systemKey, value);
  }

  return system;
}

function buildDocumentData(entry, packName) {
  const source = isObject(entry) ? entry : {};
  const replaceStructuredSystem = isObject(source.system);
  const document = {
    name: String(source.name ?? "").trim(),
    type: String(source.type ?? PACK_TYPE_DEFAULTS[packName] ?? "item").trim(),
  };

  if (source.img) document.img = source.img;
  if (isObject(source.flags)) document.flags = { ...source.flags };

  const system = extractSystemData(source);
  document.system = system;

  return { document, replaceStructuredSystem };
}

function resolvePack(systemId, packName) {
  const packCollection = globalThis.game?.packs;
  if (!packCollection) return null;
  return packCollection.get(`${systemId}.${packName}`)
    ?? packCollection.find((pack) => pack?.metadata?.name === packName && pack?.metadata?.packageName === systemId)
    ?? null;
}

function buildPackRecordsFromRows(rows) {
  const grouped = {};
  for (const row of rows) {
    if (!isObject(row)) continue;
    const packName = normalizeKey(row.pack ?? row.packName ?? "");
    if (!packName) continue;
    grouped[packName] = grouped[packName] ?? [];
    grouped[packName].push(row);
  }
  return grouped;
}

function normalizeImportPayload(payload) {
  if (Array.isArray(payload)) {
    return buildPackRecordsFromRows(payload);
  }

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return {};

    try {
      const parsed = JSON.parse(trimmed);
      return normalizeImportPayload(parsed);
    } catch {
      const parsedRows = parseCompendiumImportCsv(trimmed);
      return buildPackRecordsFromRows(parsedRows);
    }
  }

  if (!isObject(payload)) return {};

  if (Array.isArray(payload.rows)) {
    return buildPackRecordsFromRows(payload.rows);
  }

  if (isObject(payload.packs)) {
    return payload.packs;
  }

  return payload;
}

export async function importCompendiumContent(payload, options = {}) {
  const mode = String(options.mode ?? "upsert").toLowerCase();
  const validModes = new Set(["create", "update", "upsert"]);
  if (!validModes.has(mode)) {
    throw new Error(`Invalid import mode '${mode}'. Use create, update, or upsert.`);
  }

  const systemId = String(options.systemId ?? "marvel-multiverse");
  const itemClass = options.itemClass ?? globalThis.Item;
  if (!itemClass || typeof itemClass.createDocuments !== "function" || typeof itemClass.updateDocuments !== "function") {
    throw new Error("Foundry Item document class is not available.");
  }

  const normalizedPayload = normalizeImportPayload(payload);
  const summary = [];
  let createdTotal = 0;
  let updatedTotal = 0;
  let skippedTotal = 0;

  for (const [rawPackName, rawEntries] of Object.entries(normalizedPayload)) {
    const packName = normalizeKey(rawPackName);
    const entries = Array.isArray(rawEntries) ? rawEntries : [];

    const pack = resolvePack(systemId, packName);
    if (!pack) {
      summary.push({ pack: packName || rawPackName, created: 0, updated: 0, skipped: entries.length, error: "pack-not-found" });
      skippedTotal += entries.length;
      continue;
    }

    const index = await pack.getIndex({ fields: ["name"] });
    const existingByName = new Map();
    for (const row of index.contents ?? []) {
      const key = normalizeName(row?.name ?? "");
      if (key && !existingByName.has(key)) {
        existingByName.set(key, row?._id ?? row?.id ?? null);
      }
    }

    const creates = [];
    const updates = [];
    let skipped = 0;

    for (const entry of entries) {
      const { document, replaceStructuredSystem } = buildDocumentData(entry, packName);
      const key = normalizeName(document.name);
      if (!key || !document.type) {
        skipped += 1;
        continue;
      }

      const existingId = existingByName.get(key);
      if (!existingId) {
        if (mode === "update") {
          skipped += 1;
          continue;
        }
        creates.push(document);
        continue;
      }

      if (mode === "create") {
        skipped += 1;
        continue;
      }

      const existing = typeof pack.getDocument === "function" ? await pack.getDocument(existingId) : null;
      const existingSystem = existing?._source?.system ?? existing?.system?.toObject?.() ?? existing?.system ?? {};
      updates.push({
        _id: existingId,
        ...(replaceStructuredSystem ? buildItemUpdateData(existingSystem, document) : document),
      });
    }

    if (!options.dryRun && creates.length) {
      await itemClass.createDocuments(creates, { pack: pack.collection });
    }
    if (!options.dryRun && updates.length) {
      await itemClass.updateDocuments(updates, { pack: pack.collection });
    }

    summary.push({
      pack: packName,
      created: creates.length,
      updated: updates.length,
      skipped,
      error: null,
    });

    createdTotal += creates.length;
    updatedTotal += updates.length;
    skippedTotal += skipped;
  }

  const result = {
    mode,
    dryRun: Boolean(options.dryRun),
    createdTotal,
    updatedTotal,
    skippedTotal,
    summary,
  };

  if (options.notify !== false) {
    globalThis.ui?.notifications?.info?.(`Compendium import complete. Created ${createdTotal}, updated ${updatedTotal}, skipped ${skippedTotal}.`);
  }

  return result;
}

export async function importCompendiumCsv(csvText, options = {}) {
  const rows = parseCompendiumImportCsv(csvText);
  return importCompendiumContent({ rows }, options);
}

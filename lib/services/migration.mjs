const SETTING_KEY = "systemMigrationVersion";

// Ordered list of migration steps. Empty today - no data migrations are needed yet - but this
// gives future schema changes (dnd5e/pf2e-style) a place to register a version + migrate(data) fn
// instead of ad hoc one-off fixups scattered across the codebase.
export const MIGRATIONS = [];

export function registerMigrationSetting() {
  if (!globalThis.game?.settings?.register) return;
  globalThis.game.settings.register("marvel-multiverse", SETTING_KEY, {
    name: "Marvel Multiverse System Migration Version",
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
}

export function getStoredMigrationVersion() {
  return globalThis.game?.settings?.get?.("marvel-multiverse", SETTING_KEY) ?? "";
}

function isNewerVersion(a, b) {
  const compare = globalThis.foundry?.utils?.isNewerVersion;
  if (typeof compare === "function") return compare(a, b);
  return String(a) !== String(b);
}

export function needsMigration(currentVersion) {
  const stored = getStoredMigrationVersion();
  if (!stored) return MIGRATIONS.length > 0;
  return isNewerVersion(currentVersion, stored);
}

function pendingMigrations(storedVersion) {
  if (!storedVersion) return [...MIGRATIONS];
  return MIGRATIONS.filter((step) => isNewerVersion(step.version, storedVersion));
}

// Applies any migration steps newer than the stored version, then stamps the world with
// currentVersion so this only ever runs once per real schema change.
export async function runMigrations(currentVersion, options = {}) {
  if (!globalThis.game?.user?.isGM) return { ran: false, applied: [] };

  const storedVersion = getStoredMigrationVersion();
  const steps = pendingMigrations(storedVersion);
  const applied = [];

  for (const step of steps) {
    try {
      await step.migrate?.(options);
      applied.push(step.version);
    } catch (error) {
      console.error(`Marvel Multiverse | Migration to ${step.version} failed`, error);
    }
  }

  if (globalThis.game?.settings?.set && (steps.length > 0 || storedVersion !== currentVersion)) {
    await globalThis.game.settings.set("marvel-multiverse", SETTING_KEY, currentVersion);
  }

  return { ran: steps.length > 0, applied };
}

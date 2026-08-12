export const EFFECT_PROFILE_PHASES = Object.freeze([
  "activation",
  "attack",
  "cast",
  "movement",
  "hit",
  "fantasticHit",
  "miss",
  "impact",
  "landing",
  "success",
  "failure",
]);

const SUPPORTED_PHASES = new Set(EFFECT_PROFILE_PHASES);
const DEFAULT_PROFILE_PHASES = new Set(["attack"]);
const TARGET_PHASES = new Set(["hit", "fantasticHit", "miss", "impact"]);

function getSourceData(source) {
  return source?.system ?? source ?? {};
}

function normalizeProfileId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeToken(value) {
  return value?.object ?? value?.document?.object ?? value?.document ?? value ?? null;
}

function defaultEffectsEnabled() {
  return globalThis.game?.settings?.get?.("marvel-multiverse", "enableSequencerEffects") === true;
}

function defaultLibrary() {
  return globalThis.game?.marvelMultiverse?.effects ?? null;
}

export function normalizeEffectMetadata(source, options = {}) {
  const data = getSourceData(source);
  const warnings = [];
  const effectProfile = normalizeProfileId(data.effectProfile);
  if (data.effectProfile !== undefined && data.effectProfile !== null && !effectProfile) {
    warnings.push({ code: "INVALID_DEFAULT_PROFILE", path: "effectProfile" });
  }

  const effectProfiles = {};
  if (data.effectProfiles !== undefined && (typeof data.effectProfiles !== "object" || data.effectProfiles === null || Array.isArray(data.effectProfiles))) {
    warnings.push({ code: "INVALID_PHASE_PROFILES", path: "effectProfiles" });
  } else {
    for (const [phase, value] of Object.entries(data.effectProfiles ?? {})) {
      if (!SUPPORTED_PHASES.has(phase)) {
        warnings.push({ code: "UNKNOWN_EFFECT_PHASE", path: `effectProfiles.${phase}`, phase });
        continue;
      }
      const profileId = normalizeProfileId(value);
      if (!profileId) {
        warnings.push({ code: "INVALID_PHASE_PROFILE", path: `effectProfiles.${phase}`, phase });
        continue;
      }
      effectProfiles[phase] = profileId;
    }
  }

  if (options.warn !== false) {
    for (const warning of warnings) {
      console.warn("Marvel Multiverse | Effect Profile", warning);
    }
  }
  return { effectProfile, effectProfiles, warnings };
}

export function resolveEffectPhaseProfile(source, phase, options = {}) {
  if (!SUPPORTED_PHASES.has(phase)) {
    if (options.warn !== false) console.warn(`Marvel Multiverse | Effect Profile | Unknown phase: ${phase}`);
    return null;
  }
  const metadata = options.metadata ?? normalizeEffectMetadata(source, options);
  const phaseProfile = metadata.effectProfiles?.[phase] ?? null;
  if (phaseProfile) return { phase, profileId: phaseProfile, resolution: "phase" };
  if (options.allowDefault !== false && DEFAULT_PROFILE_PHASES.has(phase) && metadata.effectProfile) {
    return { phase, profileId: metadata.effectProfile, resolution: "default" };
  }
  return null;
}

export function getOutcomeEffectPhases({ isAttack = false, isSuccess = false, isFantastic = false } = {}) {
  if (isAttack) {
    if (!isSuccess) return ["miss"];
    return isFantastic ? ["hit", "fantasticHit", "impact"] : ["hit", "impact"];
  }
  return [isSuccess ? "success" : "failure"];
}

export class EffectProfileSession {
  constructor(source, context = {}, options = {}) {
    this.source = source ?? null;
    this.context = context;
    this.library = options.library ?? defaultLibrary();
    this.enabled = options.enabled ?? defaultEffectsEnabled();
    this.metadata = normalizeEffectMetadata(source, { warn: options.warn !== false });
    this.completedPhases = new Set();
    this.attempts = [];
  }

  async playPhase(phase, context = {}) {
    if (this.completedPhases.has(phase)) {
      return { success: false, skipped: true, reason: "duplicate-phase", phase, profileId: null };
    }
    this.completedPhases.add(phase);

    const resolved = resolveEffectPhaseProfile(this.source, phase, { metadata: this.metadata });
    if (!resolved) return { success: false, skipped: true, reason: "profile-not-configured", phase, profileId: null };
    if (!this.enabled) return this.record({ success: false, skipped: true, reason: "effects-disabled", ...resolved });
    if (!this.library) return this.record({ success: false, skipped: true, reason: "library-unavailable", ...resolved });

    const profile = this.library.resolveProfile?.(resolved.profileId) ?? null;
    if (!profile) {
      console.warn(`Marvel Multiverse | Unknown effect profile: ${resolved.profileId}`);
      return this.record({ success: false, skipped: true, reason: "unknown-profile", ...resolved });
    }

    const executionContext = { ...this.context, ...context, phase };
    executionContext.source = executionContext.source ?? this.source;
    const sourceToken = normalizeToken(executionContext.sourceToken ?? executionContext.token ?? executionContext.actor?.token);
    const rawTargets = Array.isArray(executionContext.targets)
      ? executionContext.targets
      : executionContext.target ? [executionContext.target] : [];
    const targets = rawTargets.map(normalizeToken).filter(Boolean);
    const locations = TARGET_PHASES.has(phase)
      ? targets
      : phase === "attack" && targets.length
        ? targets
        : [sourceToken].filter(Boolean);

    if (TARGET_PHASES.has(phase) && locations.length === 0) {
      return this.record({ success: false, skipped: true, reason: "target-missing", ...resolved });
    }

    const playbackLocations = locations.length ? locations : [null];
    const results = [];
    for (const location of playbackLocations) {
      const isAttackPath = phase === "attack" && Boolean(sourceToken) && Boolean(location) && location !== sourceToken;
      results.push(await this.library.playEffect(resolved.profileId, {
        location: isAttackPath ? sourceToken : location,
        sourceLocation: sourceToken,
        targetLocation: isAttackPath ? location : null,
        stretchToTarget: isAttackPath,
        volume: executionContext.volume,
        scale: executionContext.scale,
      }));
    }
    const success = results.some((result) => result?.success);
    const reason = success ? null : results[0]?.reason ?? "playback-error";
    return this.record({ success, skipped: !success, reason, targetCount: targets.length, ...resolved });
  }

  record(result) {
    const entry = {
      phase: result.phase,
      profileId: result.profileId,
      success: Boolean(result.success),
      skipped: Boolean(result.skipped),
      reason: result.reason ?? null,
      resolution: result.resolution ?? null,
      targetCount: result.targetCount ?? 0,
    };
    this.attempts.push(entry);
    return entry;
  }

  getPlayedMetadata() {
    return this.attempts
      .filter((entry) => entry.success)
      .map((entry) => ({ phase: entry.phase, profile: entry.profileId }));
  }
}

export function createEffectProfileSession(source, context = {}, options = {}) {
  return new EffectProfileSession(source, context, options);
}
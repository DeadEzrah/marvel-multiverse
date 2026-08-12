function defaultModuleActive(moduleId) {
  return globalThis.game?.modules?.get?.(moduleId)?.active === true;
}

function selectRandom(entries, random) {
  if (!entries.length) return null;
  const index = Math.min(entries.length - 1, Math.floor(random() * entries.length));
  return entries[index] ?? null;
}

export class EffectLibrary {
  constructor(manifest = {}, options = {}) {
    this.manifest = manifest;
    this.random = options.random ?? Math.random;
    this.moduleActive = options.moduleActive ?? defaultModuleActive;
    this.effects = new Map((manifest.effects ?? []).map((effect) => [effect.id, effect]));
  }

  resolveProfile(profileId) {
    let candidate = String(profileId ?? "").trim();
    const visited = new Set();
    while (candidate && !visited.has(candidate)) {
      visited.add(candidate);
      const effect = this.effects.get(candidate);
      if (effect) return effect;
      const configuredFallback = this.manifest.fallbacks?.[candidate];
      if (configuredFallback) {
        candidate = configuredFallback;
        continue;
      }
      const separator = candidate.lastIndexOf(".");
      candidate = separator > 0 ? candidate.slice(0, separator) : "";
    }
    return null;
  }

  isAssetAvailable(asset) {
    if (asset?.kind === "sequencer-database" && !this.moduleActive("sequencer")) return false;
    const moduleIds = Array.isArray(asset?.moduleIds) ? asset.moduleIds : [];
    return moduleIds.length === 0 || moduleIds.some((moduleId) => this.moduleActive(moduleId));
  }

  getAsset(profileId, collection) {
    const profile = this.resolveProfile(profileId);
    if (!profile) return null;
    const available = (profile[collection] ?? []).filter((asset) => this.isAssetAvailable(asset));
    return selectRandom(available, this.random)?.file ?? null;
  }

  getSound(profileId) {
    return this.getAsset(profileId, "sounds");
  }

  getAnimation(profileId) {
    return this.getAsset(profileId, "animations");
  }

  getEffect(profileId) {
    const profile = this.resolveProfile(profileId);
    if (!profile) return { profileId: null, sound: null, animation: null };
    return {
      profileId: profile.id,
      sound: this.getSound(profile.id),
      animation: this.getAnimation(profile.id),
    };
  }

  getDocumentProfile(document, phase = "default") {
    const system = document?.system ?? document ?? {};
    const phaseProfile = system.effectProfiles?.[phase];
    if (typeof phaseProfile === "string" && phaseProfile.trim()) return phaseProfile.trim();
    return typeof system.effectProfile === "string" && system.effectProfile.trim()
      ? system.effectProfile.trim()
      : null;
  }

  getDocumentEffect(document, phase = "default") {
    return this.getEffect(this.getDocumentProfile(document, phase));
  }

  playDocumentEffect(document, phase = "default", options = {}) {
    return this.playEffect(this.getDocumentProfile(document, phase), options);
  }

  async playEffect(profileId, options = {}) {
    if (typeof globalThis.Sequence !== "function") {
      return { success: false, reason: "sequencer-unavailable", profileId: null };
    }
    const effect = this.getEffect(profileId);
    if (!effect.sound && !effect.animation) {
      return { success: false, reason: "assets-unavailable", profileId: effect.profileId };
    }

    try {
      const sequence = new globalThis.Sequence();
      if (effect.animation && options.location) {
        const animation = sequence.effect().file(effect.animation).atLocation(options.location);
        if (options.stretchToTarget && options.targetLocation && typeof animation.stretchTo === "function") {
          animation.stretchTo(options.targetLocation);
        }
        if (Number.isFinite(options.scale)) animation.scale(options.scale);
      }
      if (effect.sound) {
        const sound = sequence.sound().file(effect.sound);
        if (Number.isFinite(options.volume)) sound.volume(options.volume);
      }
      await sequence.play();
      return { success: true, reason: null, ...effect };
    } catch (error) {
      console.warn(`Marvel Multiverse | Could not play effect profile "${profileId}".`, error);
      return { success: false, reason: "playback-error", profileId: effect.profileId };
    }
  }
}

export async function loadEffectLibrary(options = {}) {
  const manifestUrl = options.manifestUrl ?? "systems/marvel-multiverse/assets/effects-manifest.json";
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Could not load effect manifest: ${response.status}`);
  return new EffectLibrary(await response.json(), options);
}
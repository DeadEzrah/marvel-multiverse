const AREA_SHAPES = new Set(["circle", "cone", "line", "rectangle", "wall"]);

function finitePositive(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function resolveRank(source) {
  return finitePositive(source?.actor?.system?.attributes?.rank?.value
    ?? source?.parent?.system?.attributes?.rank?.value, 1);
}

function resolveReach(source) {
  const reach = Number(source?.actor?.system?.reach ?? source?.parent?.system?.reach);
  return Number.isFinite(reach) && reach >= 0 ? reach : 1;
}

function resolveScaledSpaces(value, scaling, source, fallback = null) {
  const spaces = finitePositive(value, fallback);
  if (spaces === null) return null;
  const mode = String(scaling ?? "").toLowerCase();
  if (mode === "rank") return spaces * resolveRank(source);
  if (mode === "reach") return spaces * resolveReach(source);
  if (mode === "rank-plus-reach") return (spaces * resolveRank(source)) + resolveReach(source);
  return spaces;
}

export function resolveAreaTargetingConfig(source) {
  const area = source?.system?.targeting?.area ?? source?.targeting?.area ?? null;
  if (!area || area.enabled === false) return null;

  const shape = String(area.shape ?? "").trim().toLowerCase();
  const distance = resolveScaledSpaces(area.distance, area.distanceScaling, source);
  if (!AREA_SHAPES.has(shape) || distance === null) return null;

  return {
    shape,
    origin: String(area.origin ?? "placed").toLowerCase() === "source" ? "source" : "placed",
    units: "spaces",
    distance,
    width: resolveScaledSpaces(area.width, area.widthScaling, source, 1),
    height: resolveScaledSpaces(area.height, area.heightScaling, source, distance),
    angle: finitePositive(area.angle, 90),
    placementRange: resolveScaledSpaces(area.placementRange, area.placementRangeScaling, source),
    persistent: Boolean(area.persistent),
    duration: String(area.duration ?? source?.system?.duration ?? "").trim() || null,
    includeSelf: Boolean(area.includeSelf),
    requiresLineOfSight: Boolean(area.requiresLineOfSight),
    attackAnimation: String(area.attackAnimation ?? "center").toLowerCase() === "targets" ? "targets" : "center",
    targetFilter: ["all", "enemies", "allies"].includes(String(area.targetFilter ?? "all").toLowerCase())
      ? String(area.targetFilter ?? "all").toLowerCase()
      : "all",
  };
}

export function buildAreaRegionData(config, options = {}) {
  if (!config || !AREA_SHAPES.has(config.shape)) return null;
  const gridSize = finitePositive(options.gridSize, 100);
  const distance = finitePositive(config.distance);
  if (distance === null) return null;

  const length = distance * gridSize;
  const common = { type: config.shape === "wall" ? "rectangle" : config.shape, x: 0, y: 0 };
  let shape;
  if (config.shape === "circle") {
    shape = { ...common, radius: length };
  } else if (config.shape === "cone") {
    shape = { ...common, radius: length, angle: finitePositive(config.angle, 90), rotation: 0 };
  } else if (config.shape === "line") {
    shape = { ...common, length, width: finitePositive(config.width, 1) * gridSize, rotation: 0 };
  } else if (config.shape === "wall") {
    shape = {
      ...common,
      width: length,
      height: finitePositive(config.width, 1) * gridSize,
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: 0,
    };
  } else {
    shape = {
      ...common,
      width: finitePositive(config.width, distance) * gridSize,
      height: finitePositive(config.height, distance) * gridSize,
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: 0,
    };
  }

  return {
    name: options.name ?? "Power Area",
    shapes: [shape],
    flags: {
      "marvel-multiverse": {
        powerArea: {
          sourceUuid: options.sourceUuid ?? null,
          shape: config.shape,
          units: "spaces",
          placementRange: config.placementRange ?? null,
          persistent: Boolean(config.persistent),
          duration: config.duration ?? null,
          temporary: true,
        },
      },
    },
  };
}

function getTokenPoint(token, gridSize) {
  if (Number.isFinite(token?.center?.x) && Number.isFinite(token?.center?.y)) {
    return {
      x: token.center.x,
      y: token.center.y,
      elevation: Number(token?.document?.elevation ?? token?.elevation ?? 0) || 0,
    };
  }

  const document = token?.document ?? token;
  const x = Number(document?.x);
  const y = Number(document?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: x + (finitePositive(document?.width, 1) * gridSize) / 2,
    y: y + (finitePositive(document?.height, 1) * gridSize) / 2,
    elevation: Number(document?.elevation ?? 0) || 0,
  };
}

function matchesTargetFilter(token, sourceDisposition, targetFilter) {
  if (targetFilter === "all" || !Number.isFinite(sourceDisposition) || sourceDisposition === 0) return true;
  const document = token?.document ?? token;
  const targetDisposition = Number(document?.disposition);
  if (!Number.isFinite(targetDisposition) || targetDisposition === 0) return false;
  return targetFilter === "enemies"
    ? targetDisposition === -sourceDisposition
    : targetDisposition === sourceDisposition;
}

function hasLineOfSight(sourcePoint, targetPoint, options = {}) {
  if (typeof options.testLineOfSight === "function") return options.testLineOfSight(sourcePoint, targetPoint);
  const sight = globalThis.CONFIG?.Canvas?.polygonBackends?.sight;
  if (typeof sight?.testCollision !== "function") return true;
  return !sight.testCollision(sourcePoint, targetPoint, { type: "sight", mode: "any" });
}

export function resolveRegionTargets(region, tokens, options = {}) {
  const regionDocument = region?.document ?? region;
  if (typeof regionDocument?.testPoint !== "function") return [];
  const gridSize = finitePositive(options.gridSize, 100);
  const sourceTokenUuid = options.sourceTokenUuid ?? null;
  const sourceDisposition = Number(options.sourceDisposition);
  const targetFilter = options.targetFilter ?? "all";
  const sourcePoint = options.sourceToken ? getTokenPoint(options.sourceToken, gridSize) : null;
  const includeSelf = Boolean(options.includeSelf);
  const seen = new Set();
  const targets = [];

  for (const token of Array.from(tokens ?? [])) {
    const document = token?.document ?? token;
    const uuid = document?.uuid ?? token?.uuid ?? null;
    if (!uuid || seen.has(uuid) || !token?.actor) continue;
    if (!includeSelf && sourceTokenUuid && uuid === sourceTokenUuid) continue;
    if (!matchesTargetFilter(token, sourceDisposition, targetFilter)) continue;
    if (token.visible === false && options.includeHidden !== true) continue;

    const point = getTokenPoint(token, gridSize);
    if (!point) continue;
    if (options.requiresLineOfSight && sourcePoint && !hasLineOfSight(sourcePoint, point, options)) continue;
    if (!regionDocument.testPoint(point)) continue;
    seen.add(uuid);
    targets.push(token);
  }

  return targets;
}

export function resolveSourceCircleTargets(sourceToken, tokens, config, options = {}) {
  if (!sourceToken || config?.shape !== "circle" || config?.origin !== "source") return [];
  const gridSize = finitePositive(options.gridSize, 100);
  const sceneCellDistance = finitePositive(options.sceneCellDistance, 1);
  const sourcePoint = getTokenPoint(sourceToken, gridSize);
  if (!sourcePoint) return [];
  const sourceTokenUuid = sourceToken?.document?.uuid ?? sourceToken?.uuid ?? null;
  const sourceDisposition = Number((sourceToken?.document ?? sourceToken)?.disposition);
  const targets = [];
  const seen = new Set();

  for (const token of Array.from(tokens ?? [])) {
    const document = token?.document ?? token;
    const uuid = document?.uuid ?? token?.uuid ?? null;
    if (!uuid || seen.has(uuid) || !token?.actor) continue;
    if (!config.includeSelf && sourceTokenUuid && uuid === sourceTokenUuid) continue;
    if (!matchesTargetFilter(token, sourceDisposition, config.targetFilter)) continue;
    if (token.visible === false && options.includeHidden !== true) continue;
    const point = getTokenPoint(token, gridSize);
    if (!point) continue;
    if (config.requiresLineOfSight && !hasLineOfSight(sourcePoint, point, options)) continue;
    const measured = options.canvas?.grid?.measurePath?.([sourcePoint, point]);
    const distance = Number.isFinite(Number(measured?.distance))
      ? Number(measured.distance) / sceneCellDistance
      : Math.hypot(point.x - sourcePoint.x, point.y - sourcePoint.y) / gridSize;
    if (distance > config.distance + 0.001) continue;
    seen.add(uuid);
    targets.push(token);
  }
  return targets;
}

export async function placePowerArea(source, options = {}) {
  const config = resolveAreaTargetingConfig(source);
  if (!config) return { configured: false, cancelled: false, region: null, targets: [] };

  const canvas = options.canvas ?? globalThis.canvas;
  if (!canvas?.ready) {
    return { configured: true, cancelled: true, error: "canvas-unavailable", region: null, targets: [] };
  }

  const sourceToken = options.sourceToken ?? null;
  if (config.origin === "source" && config.shape === "circle") {
    if (!sourceToken) return { configured: true, cancelled: true, error: "source-token-unavailable", region: null, targets: [] };
    const targets = resolveSourceCircleTargets(sourceToken, canvas.tokens?.placeables ?? [], config, {
      canvas,
      gridSize: canvas.grid?.size,
      sceneCellDistance: canvas.scene?.grid?.distance,
      includeHidden: Boolean(globalThis.game?.user?.isGM),
    });
    return { configured: true, cancelled: false, config, region: null, location: sourceToken, targets };
  }

  if (typeof canvas?.regions?.placeRegion !== "function") {
    return { configured: true, cancelled: true, error: "canvas-unavailable", region: null, targets: [] };
  }

  const data = buildAreaRegionData(config, {
    gridSize: canvas.grid?.size,
    name: source?.name ? `${source.name} Area` : "Power Area",
    sourceUuid: source?.uuid,
  });
  const region = await canvas.regions.placeRegion(data, {
    create: false,
    allowRotation: config.shape !== "circle",
  });
  if (!region) return { configured: true, cancelled: true, region: null, targets: [] };

  const sourceTokenUuid = sourceToken?.document?.uuid ?? sourceToken?.uuid ?? null;
  const sourceDisposition = Number((sourceToken?.document ?? sourceToken)?.disposition);
  const targets = resolveRegionTargets(region, canvas.tokens?.placeables ?? [], {
    gridSize: canvas.grid?.size,
    sourceTokenUuid,
    sourceToken,
    sourceDisposition,
    targetFilter: config.targetFilter,
    requiresLineOfSight: config.requiresLineOfSight,
    includeSelf: config.includeSelf,
    includeHidden: Boolean(globalThis.game?.user?.isGM),
  });
  return { configured: true, cancelled: false, config, region, location: region, targets };
}
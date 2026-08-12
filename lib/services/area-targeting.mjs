const AREA_SHAPES = new Set(["circle", "cone", "line", "rectangle"]);

function finitePositive(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function resolveAreaTargetingConfig(source) {
  const area = source?.system?.targeting?.area ?? source?.targeting?.area ?? null;
  if (!area || area.enabled === false) return null;

  const shape = String(area.shape ?? "").trim().toLowerCase();
  const distance = finitePositive(area.distance);
  if (!AREA_SHAPES.has(shape) || distance === null) return null;

  return {
    shape,
    distance,
    width: finitePositive(area.width, 1),
    height: finitePositive(area.height, distance),
    angle: finitePositive(area.angle, 90),
    includeSelf: Boolean(area.includeSelf),
  };
}

export function buildAreaRegionData(config, options = {}) {
  if (!config || !AREA_SHAPES.has(config.shape)) return null;
  const gridSize = finitePositive(options.gridSize, 100);
  const distance = finitePositive(config.distance);
  if (distance === null) return null;

  const length = distance * gridSize;
  const common = { type: config.shape, x: 0, y: 0 };
  let shape;
  if (config.shape === "circle") {
    shape = { ...common, radius: length };
  } else if (config.shape === "cone") {
    shape = { ...common, radius: length, angle: finitePositive(config.angle, 90), rotation: 0 };
  } else if (config.shape === "line") {
    shape = { ...common, length, width: finitePositive(config.width, 1) * gridSize, rotation: 0 };
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

export function resolveRegionTargets(region, tokens, options = {}) {
  if (!region || typeof region.testPoint !== "function") return [];
  const gridSize = finitePositive(options.gridSize, 100);
  const sourceTokenUuid = options.sourceTokenUuid ?? null;
  const includeSelf = Boolean(options.includeSelf);
  const seen = new Set();
  const targets = [];

  for (const token of Array.from(tokens ?? [])) {
    const document = token?.document ?? token;
    const uuid = document?.uuid ?? token?.uuid ?? null;
    if (!uuid || seen.has(uuid) || !token?.actor) continue;
    if (!includeSelf && sourceTokenUuid && uuid === sourceTokenUuid) continue;
    if (token.visible === false && options.includeHidden !== true) continue;

    const point = getTokenPoint(token, gridSize);
    if (!point || !region.testPoint(point)) continue;
    seen.add(uuid);
    targets.push(token);
  }

  return targets;
}

export async function placePowerArea(source, options = {}) {
  const config = resolveAreaTargetingConfig(source);
  if (!config) return { configured: false, cancelled: false, region: null, targets: [] };

  const canvas = options.canvas ?? globalThis.canvas;
  if (!canvas?.ready || typeof canvas?.regions?.placeRegion !== "function") {
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

  const sourceToken = options.sourceToken ?? null;
  const sourceTokenUuid = sourceToken?.document?.uuid ?? sourceToken?.uuid ?? null;
  const targets = resolveRegionTargets(region, canvas.tokens?.placeables ?? [], {
    gridSize: canvas.grid?.size,
    sourceTokenUuid,
    includeSelf: config.includeSelf,
    includeHidden: Boolean(globalThis.game?.user?.isGM),
  });
  return { configured: true, cancelled: false, config, region, targets };
}
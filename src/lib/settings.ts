export const FPS = 60;

export const TRIANGLE_SHADES = ['weakest', 'average'] as const;
export type TriangleShade = (typeof TRIANGLE_SHADES)[number];

export const TRIANGLE_STYLES = ['mosaic', 'overlapping'] as const;
export type TriangleStyle = (typeof TRIANGLE_STYLES)[number];

export const MOUSE_MODES = ['off', 'attract', 'repel', 'vortex'] as const;
export type MouseMode = (typeof MOUSE_MODES)[number];

export const DEFAULT_SETTINGS = {
  paused: false,
  density: 1,
  maxSpeed: 0.15,
  minRadius: 0.5,
  maxRadius: 1.5,
  pointColor: '#ffffff',
  connectDistance: 100,
  fade: 2,
  lineWidth: 0.6,
  lineColor: '#ffffff',
  additive: true,
  triangles: false,
  triangleStyle: 'mosaic' as TriangleStyle,
  triangleShade: 'weakest' as TriangleShade,
  triangleColor: '#4d7cff',
  triangleOpacity: 0.3,
  triangleTransition: 400,
  mouseMode: 'off' as MouseMode,
  mouseRadius: 150,
  mouseStrength: 0.1,
  cursorLinks: true,
  cursorTriangles: false,
  shockwave: true,
  shockwaveStrength: 3,
  shockwaveReach: 400,
  shockwaveSpeed: 600,
  flashlight: true,
  flashlightRadius: 200,
  flashlightBoost: 3,
  backgroundInner: '#0b1226',
  backgroundOuter: '#000000',
};

export type Settings = typeof DEFAULT_SETTINGS;

export const RANGES = {
  density: { min: 0.1, max: 4, step: 0.1 },
  maxSpeed: { min: 0, max: 1, step: 0.01 },
  minRadius: { min: 0.1, max: 4, step: 0.1 },
  maxRadius: { min: 0.1, max: 4, step: 0.1 },
  connectDistance: { min: 40, max: 250, step: 5 },
  fade: { min: 0.5, max: 4, step: 0.1 },
  lineWidth: { min: 0.25, max: 3, step: 0.05 },
  triangleOpacity: { min: 0, max: 1, step: 0.01 },
  triangleTransition: { min: 0, max: 2000, step: 50 },
  mouseRadius: { min: 50, max: 500, step: 10 },
  mouseStrength: { min: 0, max: 0.5, step: 0.01 },
  shockwaveStrength: { min: 0, max: 10, step: 0.1 },
  shockwaveReach: { min: 100, max: 1500, step: 50 },
  shockwaveSpeed: { min: 100, max: 3000, step: 50 },
  flashlightRadius: { min: 50, max: 600, step: 10 },
  flashlightBoost: { min: 0, max: 10, step: 0.1 },
} satisfies Partial<
  Record<keyof Settings, { min: number; max: number; step: number }>
>;

const COLOR_KEYS = [
  'pointColor',
  'lineColor',
  'triangleColor',
  'backgroundInner',
  'backgroundOuter',
] as const;

const BOOLEAN_KEYS = [
  'additive',
  'triangles',
  'cursorLinks',
  'cursorTriangles',
  'shockwave',
  'flashlight',
] as const;

const STORAGE_KEY = 'proximity-graph-settings';

export function loadSettings(): Settings {
  const settings = { ...DEFAULT_SETTINGS };

  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return settings;
  }
  if (typeof stored !== 'object' || stored === null) {
    return settings;
  }

  const values = stored as Record<string, unknown>;
  for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const { min, max } = RANGES[key];
      settings[key] = Math.min(max, Math.max(min, value));
    }
  }
  for (const key of COLOR_KEYS) {
    const value = values[key];
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
      settings[key] = value;
    }
  }
  for (const key of BOOLEAN_KEYS) {
    const value = values[key];
    if (typeof value === 'boolean') {
      settings[key] = value;
    }
  }
  const shade = TRIANGLE_SHADES.find((name) => name === values.triangleShade);
  if (shade) {
    settings.triangleShade = shade;
  }
  const style = TRIANGLE_STYLES.find((name) => name === values.triangleStyle);
  if (style) {
    settings.triangleStyle = style;
  }
  const mode = MOUSE_MODES.find((name) => name === values.mouseMode);
  if (mode) {
    settings.mouseMode = mode;
  }

  return settings;
}

export function saveSettings(settings: Settings) {
  // Only changed values are saved so new defaults still reach returning
  // visitors, and paused never is so a reload always starts animating
  const changed = Object.fromEntries(
    Object.entries(settings).filter(
      ([key, value]) =>
        key !== 'paused' && value !== DEFAULT_SETTINGS[key as keyof Settings],
    ),
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
  } catch {
    // Storage can be disabled or full; settings then last until reload
  }
}

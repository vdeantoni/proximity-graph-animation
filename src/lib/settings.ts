export const FPS = 60;

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
} satisfies Partial<
  Record<keyof Settings, { min: number; max: number; step: number }>
>;

const COLOR_KEYS = [
  'pointColor',
  'lineColor',
  'backgroundInner',
  'backgroundOuter',
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
  if (typeof values.additive === 'boolean') {
    settings.additive = values.additive;
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

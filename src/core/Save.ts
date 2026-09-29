export type Quality = 'low' | 'medium' | 'high';
export type SteerMode = 'camera' | 'classic';

export interface Settings {
  masterVol: number;
  musicVol: number;
  sfxVol: number;
  sensitivity: number;
  invertY: boolean;
  steerMode: SteerMode;
  quality: Quality;
  screenShake: number;
  aimAssist: boolean;
  showFps: boolean;
  fov: number;
  damageNumbers: boolean;
}

export interface SaveData {
  version: number;
  crowns: number;
  totalCrowns: number;
  runs: number;
  wins: number;
  bestFloor: number;
  kills: number;
  legendaries: number;
  bossKills: number;
  unlockedCars: string[];
  upgrades: Record<string, number>;
  seenTutorial: boolean;
  lastCar: string;
  settings: Settings;
}

const KEY = 'dungeon-drivers-save-v1';

export const defaultSettings = (): Settings => ({
  masterVol: 0.8,
  musicVol: 0.55,
  sfxVol: 0.8,
  sensitivity: 1,
  invertY: false,
  steerMode: 'camera',
  quality: 'high',
  screenShake: 1,
  aimAssist: true,
  showFps: false,
  fov: 72,
  damageNumbers: true,
});

const defaults = (): SaveData => ({
  version: 1,
  crowns: 0,
  totalCrowns: 0,
  runs: 0,
  wins: 0,
  bestFloor: 0,
  kills: 0,
  legendaries: 0,
  bossKills: 0,
  unlockedCars: ['rustbucket'],
  upgrades: {},
  seenTutorial: false,
  lastCar: 'rustbucket',
  settings: defaultSettings(),
});

class SaveManager {
  data: SaveData = defaults();
  constructor() {
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const d = defaults();
        this.data = { ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings || {}) } };
      }
    } catch {
      this.data = defaults();
    }
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable (private mode) - progress lives for this session only */
    }
  }
  reset() {
    const settings = this.data.settings;
    this.data = defaults();
    this.data.settings = settings;
    this.save();
  }
  get settings() {
    return this.data.settings;
  }
  upgrade(id: string) {
    return this.data.upgrades[id] ?? 0;
  }
}

export const Save = new SaveManager();

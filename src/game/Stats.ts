export interface CarStats {
  maxHp: number;
  armor: number;
  maxShield: number;
  shieldDelay: number;
  shieldRate: number;
  topSpeed: number;
  accel: number;
  grip: number;
  handling: number;
  driftCharge: number;
  boostMax: number;
  boostRegen: number;
  boostPower: number;
  mass: number;
  ramDamage: number;
  ramResist: number;
  dmg: number;
  critChance: number;
  critDmg: number;
  fireRate: number;
  reloadSpeed: number;
  magSize: number;
  elemChance: number;
  elemDmg: number;
  splash: number;
  projSpeed: number;
  luck: number;
  goldFind: number;
  xpGain: number;
  pickupRadius: number;
  cooldown: number;
  lifesteal: number;
  hpRegen: number;
  hornPower: number;
  bossDmg: number;
}

export type StatKey = keyof CarStats;

export interface Mod {
  stat: StatKey;
  add?: number;
  mul?: number;
}

/** Friendly labels + formatting for stat modifiers. */
export const STAT_INFO: Record<StatKey, { label: string; pct?: boolean; invert?: boolean; icon: string }> = {
  maxHp: { label: 'Max Hull', icon: 'heart' },
  armor: { label: 'Armor', icon: 'shield' },
  maxShield: { label: 'Shield Capacity', icon: 'shield' },
  shieldDelay: { label: 'Shield Delay', invert: true, icon: 'shield' },
  shieldRate: { label: 'Shield Recharge', icon: 'shield' },
  topSpeed: { label: 'Top Speed', icon: 'engine' },
  accel: { label: 'Acceleration', icon: 'engine' },
  grip: { label: 'Grip', icon: 'wheel' },
  handling: { label: 'Handling', icon: 'wheel' },
  driftCharge: { label: 'Drift Charge', icon: 'wheel' },
  boostMax: { label: 'Nitro Capacity', icon: 'engine' },
  boostRegen: { label: 'Nitro Regen', icon: 'engine' },
  boostPower: { label: 'Nitro Power', icon: 'engine' },
  mass: { label: 'Weight', icon: 'gear' },
  ramDamage: { label: 'Ram Damage', icon: 'plow' },
  ramResist: { label: 'Impact Resist', icon: 'plow' },
  dmg: { label: 'Weapon Damage', icon: 'cannon' },
  critChance: { label: 'Crit Chance', pct: true, icon: 'skull' },
  critDmg: { label: 'Crit Damage', icon: 'skull' },
  fireRate: { label: 'Fire Rate', icon: 'cannon' },
  reloadSpeed: { label: 'Reload Speed', icon: 'cannon' },
  magSize: { label: 'Magazine Size', icon: 'cannon' },
  elemChance: { label: 'Elemental Chance', icon: 'flame' },
  elemDmg: { label: 'Elemental Damage', icon: 'flame' },
  splash: { label: 'Splash Radius', icon: 'rocket' },
  projSpeed: { label: 'Projectile Speed', icon: 'rocket' },
  luck: { label: 'Luck', icon: 'clover' },
  goldFind: { label: 'Gold Find', icon: 'coin' },
  xpGain: { label: 'XP Gain', icon: 'crown' },
  pickupRadius: { label: 'Pickup Radius', icon: 'gear' },
  cooldown: { label: 'Gadget Cooldown', invert: true, icon: 'gear' },
  lifesteal: { label: 'Lifesteal', pct: true, icon: 'heart' },
  hpRegen: { label: 'Hull Regen /s', icon: 'heart' },
  hornPower: { label: 'Horn Power', icon: 'gear' },
  bossDmg: { label: 'Boss Damage', icon: 'crown' },
};

export function baseStats(): CarStats {
  return {
    maxHp: 500,
    armor: 10,
    maxShield: 220,
    shieldDelay: 3.2,
    shieldRate: 0.3,
    topSpeed: 42,
    accel: 30,
    grip: 7.5,
    handling: 1,
    driftCharge: 1,
    boostMax: 100,
    boostRegen: 14,
    boostPower: 1,
    mass: 1,
    ramDamage: 1,
    ramResist: 0,
    dmg: 1,
    critChance: 0.05,
    critDmg: 2,
    fireRate: 1,
    reloadSpeed: 1,
    magSize: 1,
    elemChance: 1,
    elemDmg: 1,
    splash: 1,
    projSpeed: 1,
    luck: 0,
    goldFind: 1,
    xpGain: 1,
    pickupRadius: 9,
    cooldown: 1,
    lifesteal: 0,
    hpRegen: 0,
    hornPower: 1,
    bossDmg: 1,
  };
}

/** Accumulates additive and multiplicative modifiers then resolves: (base + add) * (1 + mul). */
export class StatBuilder {
  private adds: Partial<Record<StatKey, number>> = {};
  private muls: Partial<Record<StatKey, number>> = {};
  specials = new Map<string, number>();

  apply(m: Mod, times = 1) {
    if (m.add) this.adds[m.stat] = (this.adds[m.stat] ?? 0) + m.add * times;
    if (m.mul) this.muls[m.stat] = (this.muls[m.stat] ?? 0) + m.mul * times;
  }
  applyAll(mods: readonly Mod[] | undefined, times = 1) {
    if (mods) for (const m of mods) this.apply(m, times);
  }
  special(id: string, amount = 1) {
    this.specials.set(id, (this.specials.get(id) ?? 0) + amount);
  }
  resolve(base: CarStats): CarStats {
    const out = { ...base };
    for (const k of Object.keys(out) as StatKey[]) {
      const a = this.adds[k] ?? 0;
      const m = this.muls[k] ?? 0;
      out[k] = (base[k] + a) * Math.max(0.05, 1 + m);
    }
    out.critChance = Math.min(0.95, out.critChance);
    out.cooldown = Math.max(0.25, out.cooldown);
    out.shieldDelay = Math.max(0.6, out.shieldDelay);
    out.lifesteal = Math.min(0.25, out.lifesteal);
    return out;
  }
}

export function describeMod(m: Mod): string {
  const info = STAT_INFO[m.stat];
  const parts: string[] = [];
  if (m.add) {
    const v = m.add;
    const sign = v > 0 ? '+' : '';
    if (info.pct) parts.push(`${sign}${Math.round(v * 100)}% ${info.label}`);
    else if (m.stat === 'shieldDelay') parts.push(`${sign}${v.toFixed(1)}s ${info.label}`);
    else parts.push(`${sign}${Math.abs(v) < 10 && v % 1 !== 0 ? v.toFixed(1) : Math.round(v)} ${info.label}`);
  }
  if (m.mul) {
    const v = m.mul;
    parts.push(`${v > 0 ? '+' : ''}${Math.round(v * 100)}% ${info.label}`);
  }
  return parts.join(', ');
}

export function modIsGood(m: Mod) {
  const info = STAT_INFO[m.stat];
  const v = (m.add ?? 0) + (m.mul ?? 0);
  return info.invert ? v < 0 : v > 0;
}

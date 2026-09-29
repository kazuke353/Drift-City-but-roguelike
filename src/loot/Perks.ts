import type { Mod } from '../game/Stats';
import type { Rng } from '../core/Rng';

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  max: number;
  mods?: Mod[];
  special?: string;
  weight?: number;
}

export const PERKS: PerkDef[] = [
  { id: 'driftCharge', name: 'Drift Charge', desc: 'Drifting reloads your weapons faster.', icon: 'wheel', color: '#ff3a4a', max: 3, special: 'driftReload' },
  { id: 'bulletPlating', name: 'Bullet Plating', desc: '+25% armor while moving.', icon: 'shield', color: '#3ad0ff', max: 3, special: 'movingArmor' },
  { id: 'luckyFinds', name: 'Lucky Finds', desc: 'Higher chance for rare parts.', icon: 'clover', color: '#3aff7a', max: 3, mods: [{ stat: 'luck', add: 7 }] },
  { id: 'heavyRounds', name: 'Heavy Rounds', desc: '+12% weapon damage.', icon: 'cannon', color: '#ff8a2a', max: 5, mods: [{ stat: 'dmg', mul: 0.12 }], weight: 1.4 },
  { id: 'hotBarrels', name: 'Hot Barrels', desc: '+10% fire rate.', icon: 'flame', color: '#ff5a1a', max: 5, mods: [{ stat: 'fireRate', mul: 0.1 }], weight: 1.3 },
  { id: 'thickHull', name: 'Thick Hull', desc: '+15% max hull and repair 15%.', icon: 'heart', color: '#ff3a3a', max: 5, mods: [{ stat: 'maxHp', mul: 0.15 }], special: 'healNow', weight: 1.3 },
  { id: 'capacitor', name: 'Capacitor', desc: '+20% shield capacity.', icon: 'shield', color: '#3a8aff', max: 5, mods: [{ stat: 'maxShield', mul: 0.2 }], weight: 1.2 },
  { id: 'quickCharge', name: 'Quick Charge', desc: 'Shields recharge sooner and faster.', icon: 'bolt', color: '#80c0ff', max: 3, mods: [{ stat: 'shieldDelay', add: -0.5 }, { stat: 'shieldRate', mul: 0.2 }] },
  { id: 'nitroLungs', name: 'Nitro Lungs', desc: '+30% nitro regen & capacity.', icon: 'engine', color: '#40c0ff', max: 3, mods: [{ stat: 'boostRegen', mul: 0.3 }, { stat: 'boostMax', mul: 0.3 }] },
  { id: 'leadFoot', name: 'Lead Foot', desc: '+6% top speed, +10% acceleration.', icon: 'wheel', color: '#8a8aff', max: 3, mods: [{ stat: 'topSpeed', mul: 0.06 }, { stat: 'accel', mul: 0.1 }] },
  { id: 'boneCrusher', name: 'Bone Crusher', desc: '+30% ram damage.', icon: 'plow', color: '#e6dcc0', max: 4, mods: [{ stat: 'ramDamage', mul: 0.3 }] },
  { id: 'critOptics', name: 'Crit Optics', desc: '+5% crit chance.', icon: 'skull', color: '#f2efe6', max: 4, mods: [{ stat: 'critChance', add: 0.05 }] },
  { id: 'deadeye', name: 'Deadeye', desc: '+25% crit damage.', icon: 'skull', color: '#ff2a5a', max: 3, mods: [{ stat: 'critDmg', mul: 0.25 }] },
  { id: 'scavenger', name: 'Scavenger', desc: '+25% gold find.', icon: 'coin', color: '#ffd23a', max: 3, mods: [{ stat: 'goldFind', mul: 0.25 }] },
  { id: 'magExtender', name: 'Mag Extender', desc: '+20% magazine size.', icon: 'cannon', color: '#c0c0c0', max: 3, mods: [{ stat: 'magSize', mul: 0.2 }] },
  { id: 'quickHands', name: 'Quick Hands', desc: '+20% reload speed.', icon: 'gear', color: '#c0a060', max: 3, mods: [{ stat: 'reloadSpeed', mul: 0.2 }] },
  { id: 'attunement', name: 'Elemental Attunement', desc: '+25% elemental chance and damage.', icon: 'flame', color: '#c05cff', max: 3, mods: [{ stat: 'elemChance', mul: 0.25 }, { stat: 'elemDmg', mul: 0.25 }] },
  { id: 'blastRadius', name: 'Blast Radius', desc: '+20% splash radius.', icon: 'rocket', color: '#ff7a3a', max: 3, mods: [{ stat: 'splash', mul: 0.2 }] },
  { id: 'magnetism', name: 'Magnetism', desc: '+50% pickup radius.', icon: 'coin', color: '#ffe060', max: 2, mods: [{ stat: 'pickupRadius', mul: 0.5 }] },
  { id: 'repairDrones', name: 'Repair Drones', desc: 'Regenerate 3 hull per second.', icon: 'heart', color: '#60ff9a', max: 3, mods: [{ stat: 'hpRegen', add: 3 }] },
  { id: 'gadgeteer', name: 'Gadgeteer', desc: '-15% gadget cooldown.', icon: 'gear', color: '#a0a0ff', max: 3, mods: [{ stat: 'cooldown', mul: -0.15 }] },
  { id: 'afterburner', name: 'Afterburner', desc: 'Drift boosts last longer. +20% drift charge.', icon: 'engine', color: '#ff6aff', max: 3, mods: [{ stat: 'driftCharge', mul: 0.2 }], special: 'driftBoostPlus' },
  { id: 'honkMastery', name: 'Honk Mastery', desc: 'Your horn knocks enemies back harder.', icon: 'horn', color: '#ffd23a', max: 2, mods: [{ stat: 'hornPower', mul: 1 }] },
  { id: 'scholar', name: 'Scholar of Speed', desc: '+20% XP gain.', icon: 'crown', color: '#ffc21a', max: 2, mods: [{ stat: 'xpGain', mul: 0.2 }] },
  { id: 'bossHunter', name: 'Big Game Hunter', desc: '+20% damage to bosses and elites.', icon: 'crown', color: '#ff4040', max: 3, mods: [{ stat: 'bossDmg', mul: 0.2 }] },
  { id: 'vampirism', name: 'Oil Vampire', desc: '1.5% lifesteal.', icon: 'heart', color: '#c0103a', max: 3, mods: [{ stat: 'lifesteal', add: 0.015 }] },
];

export const PERK_MAP = new Map(PERKS.map((p) => [p.id, p]));

export function rollPerkChoices(rng: Rng, owned: Record<string, number>, count = 3): PerkDef[] {
  const pool = PERKS.filter((p) => (owned[p.id] ?? 0) < p.max);
  const out: PerkDef[] = [];
  const avail = [...pool];
  while (out.length < count && avail.length) {
    const p = rng.weighted(avail.map((x) => [x, x.weight ?? 1] as const));
    out.push(p);
    avail.splice(avail.indexOf(p), 1);
  }
  return out;
}

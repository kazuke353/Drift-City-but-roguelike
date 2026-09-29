import type { Mood } from './Portrait';

export const BARKS: Record<string, { mood: Mood; lines: string[]; prio?: number }> = {
  floorStart: { mood: 'smug', lines: ['More loot ahead... which way, driver?', 'Smell that? Old gold and bad decisions.', 'New floor, new treasure. Floor it!', "Keystone's somewhere down here. Go get it."] },
  firstFloor: { mood: 'happy', prio: 2, lines: ["Welcome to the dungeon, driver! Find the Keystone, then hit the exit portal. And don't scratch the paint."] },
  fight: { mood: 'angry', lines: ['Gates are down! Make some noise!', 'Company! Show \'em what we drive!', 'Room locked. You know what to do.', 'Big bones, bigger loot!'] },
  eliteStart: { mood: 'shock', prio: 1, lines: ['Elite room! That glow means trouble.', 'Heavy hitters incoming. The Keystone is in here somewhere!'] },
  clear: { mood: 'happy', lines: ['Another room cleared! Onward to more riches!', 'Clean. Messy, but clean.', 'That\'s what I call a pit stop.', 'Loot looks good on you!'] },
  eliteKill: { mood: 'wink', lines: ['Elite down! Check the drops!', 'They drop the good stuff. Grab it!'] },
  treasure: { mood: 'happy', lines: ['Treasure room! Pop that chest!', 'Ooh, shiny. Careful, some chests bite.'] },
  vault: { mood: 'smug', lines: ['A vault! Got a key, driver?', 'Golden gate means golden goods.'] },
  shop: { mood: 'wink', lines: ['A goblin merchant. Haggle hard.', 'Shopping spree? Don\'t spend it all on fuzzy dice.'] },
  shrine: { mood: 'smug', lines: ['A shrine. Weird magic, weird deals.', 'Pray, pay, or pass.'] },
  exit: { mood: 'happy', lines: ['Exit portals! Pick a road, any road.', 'Two roads. Different treasures.'] },
  exitLocked: { mood: 'angry', lines: ['Portal\'s sealed. We need the Keystone from the elite room!'] },
  needKeystone: { mood: 'angry', prio: 1, lines: ['It won\'t budge without the Keystone!', 'Keystone first, driver!'] },
  keystone: { mood: 'happy', prio: 2, lines: ['Keystone secured! The exit portal is open!', 'Got it! Now find the exit!'] },
  needKey: { mood: 'shock', lines: ['Locked. Find a key!', 'Need a key for that one.'] },
  chest: { mood: 'happy', lines: ['Loot pinata!', 'Jackpot!', 'Treasure looks good on you!'] },
  legendary: { mood: 'shock', prio: 3, lines: ['IS THAT... LEGENDARY?! Grab it grab it grab it!', 'Orange loot! ORANGE LOOT!'] },
  mimic: { mood: 'shock', prio: 3, lines: ['THE CHEST HAS TEETH!', 'Mimic! I told you some chests bite!'] },
  downed: { mood: 'shock', prio: 3, lines: ['Engine\'s dying! Get a kill to restart it!', 'LAST GEAR! Take someone with you!'] },
  lowhp: { mood: 'shock', prio: 2, lines: ['Hull\'s cracking! Find a repair kit!', 'We\'re leaking oil AND dignity!'] },
  boss: { mood: 'angry', prio: 3, lines: ['That\'s the big one. Drive like you mean it!', 'Boss fight! Keep moving, keep shooting!'] },
  bossDown: { mood: 'happy', prio: 3, lines: ['BOSS DOWN! Look at all that loot!', 'The bigger they are, the more they drop!'] },
  bossStunned: { mood: 'wink', prio: 2, lines: ['It hit the wall! Unload on it!', 'Stunned! Now\'s your chance!'] },
  seals: { mood: 'shock', prio: 3, lines: ['Treasure Seals are shielding it! Break the seals!'] },
  levelUp: { mood: 'happy', prio: 2, lines: ['Level up! Pick a perk — press 1, 2 or 3!', 'You\'re getting better at this. Choose a perk!'] },
  driftMax: { mood: 'wink', lines: ['Ultra drift! Tokyo Crypt Drift!', 'Now THAT\'S a drift!'] },
  honk: { mood: 'smug', lines: ['HONK AND YE SHALL DIE.', 'Beep beep, bone-head.', 'HOOOONK!'] },
  ramp: { mood: 'happy', lines: ['Airtime!', 'WHEEEE!', 'Stick the landing!'] },
  equip: { mood: 'happy', lines: ['Looking dangerous!', 'Nice upgrade!', 'Ooh, that\'s a keeper.'] },
};

const last = new Map<string, number>();

export function pickBark(key: string): { text: string; mood: Mood; prio: number } | null {
  const b = BARKS[key];
  if (!b) return null;
  const now = performance.now();
  if ((last.get(key) ?? -1e9) > now - 8000 && (b.prio ?? 0) < 2) return null;
  last.set(key, now);
  return { text: b.lines[Math.floor(Math.random() * b.lines.length)], mood: b.mood, prio: b.prio ?? 0 };
}

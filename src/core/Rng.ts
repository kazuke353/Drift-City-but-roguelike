/** Small, fast, seedable PRNG (mulberry32) with gameplay helpers. */
export class Rng {
  private s: number;
  constructor(seed = (Math.random() * 0xffffffff) >>> 0) {
    this.s = seed >>> 0;
  }
  get seed() {
    return this.s;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number) {
    return Math.floor(min + (maxInclusive - min + 1) * this.next());
  }
  chance(p: number) {
    return this.next() < p;
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const e of entries) total += Math.max(0, e[1]);
    let r = this.next() * total;
    for (const e of entries) {
      r -= Math.max(0, e[1]);
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  fork() {
    return new Rng((this.next() * 0xffffffff) >>> 0);
  }
}

/** Global non-deterministic rng for cosmetic effects. */
export const fxRng = new Rng();
export const rand = (min = 0, max = 1) => min + (max - min) * Math.random();
export const randInt = (min: number, max: number) => Math.floor(min + (max - min + 1) * Math.random());
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);

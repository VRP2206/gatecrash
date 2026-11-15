/** Small seeded PRNG (mulberry32) so a day always produces the same board. */
export type Rng = {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Integer in [lo, hi], inclusive. */
  range(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
};

/** FNV-1a over a string, folded to an unsigned 32-bit seed. */
export const hashSeed = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const createRng = (seed: number): Rng => {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(items.length)];
    if (item === undefined) throw new Error('pick from empty list');
    return item;
  };
  return {
    next,
    int,
    range: (lo, hi) => lo + int(hi - lo + 1),
    pick,
    chance: (p) => next() < p,
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const a = out[i];
        const b = out[j];
        if (a === undefined || b === undefined) continue;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
  };
};

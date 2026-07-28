/**
 * Seedable RNG for deterministic dice rolls
 * Uses mulberry32 algorithm
 */

export function createRNG(seed: number): () => number {
  let state = seed;

  return function mulberry32(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollD20(rng: () => number): number {
  return Math.floor(rng() * 20) + 1;
}

export function createRandomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

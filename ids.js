/* A seeded source of ids and of chance, so that the same project, given the same messages, makes the same ids and the
   same choices again.

   createIds(seed) -> { id(prefix), random(), state(), restore(state) }
     seed     a whole number; left out, one is taken from the clock and Math.random, once, here
     id       the next id: the prefix and six letters or digits, say "g4k09zq"
     random   the next number from 0 up to (not including) 1, in place of Math.random
     state    { seed, at }: the seed it began with and where it has got to; plain data, kept in a saved project
     restore  carries on from a state given by state() */
export function createIds(seed = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0){
  let began = seed >>> 0, at = began;
  const random = () => { at = (at + 0x6D2B79F5) >>> 0; let t = at;      /* mulberry32 */
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { random,
    id: (prefix = '') => prefix + Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0'),
    state: () => ({ seed: began, at }),
    restore(state){ began = state.seed >>> 0; at = (state.at ?? state.seed) >>> 0; } };
}

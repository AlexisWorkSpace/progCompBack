'use strict';
// Generadores deterministicos de entradas grandes (los pequenos se guardan literales en exerciseTests.js).
// Usan un PRNG con semilla fija (mulberry32) y aritmetica entera: la salida es identica en cualquier version de Node.

function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}

function shuffleInPlace(rng, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
  }
  return list;
}

function arrange(rng, list, order) {
  if (order === 'asc') return list.sort((a, b) => a - b);
  if (order === 'desc') return list.sort((a, b) => b - a);
  return shuffleInPlace(rng, list);
}

const GENERATORS = {
  // A: n solicitantes, m apartamentos. mode 'random' = independientes; 'close' = apartamentos cerca de los deseados.
  'A.make'({ seed, n, m, lo = 1, hi = 1000000000, k, mode = 'random', spread = 0, order = 'random' }) {
    const rng = createRng(seed);
    const a = Array.from({ length: n }, () => rng.int(lo, hi));
    let b;
    if (mode === 'close') {
      b = Array.from({ length: m }, () => {
        const base = a[rng.int(0, n - 1)];
        const off = rng.int(-(k + spread), k + spread);
        return Math.min(1000000000, Math.max(1, base + off));
      });
    } else {
      b = Array.from({ length: m }, () => rng.int(lo, hi));
    }
    return `${n} ${m} ${k}\n${arrange(rng, a, order).join(' ')}\n${arrange(rng, b, order).join(' ')}\n`;
  },

  // C: n reservas. mode: 'random' | 'identical' | 'disjoint' | 'touching' | 'gap' | 'nested' | 'points' | 'layers'
  'C.make'({ seed, n, mode, maxT = 1000000000, maxLen = 1000, layers = 1 }) {
    const rng = createRng(seed);
    const pairs = [];
    for (let i = 0; i < n; i += 1) {
      let a; let b;
      if (mode === 'identical') { a = 1; b = maxT; }
      else if (mode === 'disjoint') { a = 1 + i * 3; b = a + 1; }          // huecos de 2: una sola habitacion alcanza
      else if (mode === 'gap') { a = 1 + i * 2; b = a + 1; }               // sale en t y el siguiente entra en t+1: comparten
      else if (mode === 'touching') { a = 1 + i; b = a + 1; }              // sale en t y el siguiente entra en t: NO comparten
      else if (mode === 'nested') { a = 1 + i; b = maxT - i; }
      else if (mode === 'points') { a = rng.int(1, maxLen); b = a; }
      else if (mode === 'layers') { const L = i % layers; a = 1 + Math.floor(i / layers) * 10 + L; b = a + 9; }
      else { a = rng.int(1, maxT); b = Math.min(maxT, a + rng.int(0, maxLen)); }
      pairs.push([a, b]);
    }
    shuffleInPlace(rng, pairs);
    return `${n}\n${pairs.map(([a, b]) => `${a} ${b}`).join('\n')}\n`;
  },
};

function generate(name, params) {
  const fn = GENERATORS[name];
  if (!fn) throw new Error(`Generador desconocido: ${name}`);
  return fn(params);
}

module.exports = { generate, GENERATORS, createRng };

const test = require('node:test');
const assert = require('node:assert/strict');
const { EXERCISES, validateOutput } = require('./exercises');
const { calculatePenalty } = require('./userStore');

const byId = (id) => EXERCISES.find((entry) => entry.id === id);
const CONTEST = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const MIN_CASES = 32;
const JUDGE_OUTPUT_LIMIT = 1024 * 1024;           // MAX_OUTPUT_SIZE de judgeWorker.js
const OUTPUT_GUARD = JUDGE_OUTPUT_LIMIT - 8 * 1024;

// ---------------------------------------------------------------- estructura general
test('the judge has the ten contest exercises plus the demo exercise', () => {
  assert.deepEqual(EXERCISES.map(({ id }) => id), [...CONTEST, 'T']);
  assert.equal(byId('T').demo, true);
});

test('every contest exercise has at least 32 cases with unique names', () => {
  for (const id of CONTEST) {
    const { tests } = byId(id);
    assert.ok(tests.length >= MIN_CASES, `exercise ${id} has only ${tests.length} cases`);
    assert.equal(new Set(tests.map((entry) => entry.name)).size, tests.length, `exercise ${id} repeats case names`);
  }
});

test('every case has an input; every case has an expected output except the checker-based exercise C', () => {
  for (const exercise of EXERCISES) {
    for (const entry of exercise.tests) {
      assert.equal(typeof entry.input, 'string', `${exercise.id}/${entry.name}`);
      assert.ok(entry.input.endsWith('\n') && !entry.input.includes('\r'), `${exercise.id}/${entry.name} bad line endings`);
      if (exercise.checker) assert.equal(entry.output, undefined, `${exercise.id}/${entry.name}`);
      else assert.match(entry.output, /^[^\n]+\n$|^[^\n]+(\n[^\n]+)*\n$/, `${exercise.id}/${entry.name}`);
    }
  }
});

test('the demo exercise has a small, fast set of cases', () => {
  const { tests } = byId('T');
  assert.ok(tests.length >= 3 && tests.length <= 10);
});

// ---------------------------------------------------------------- restricciones de cada enunciado
const VOWELS = 'AEIOU';
const tokens = (input) => input.trim().split(/\s+/);
const lines = (input) => input.replace(/\n$/, '').split('\n');
const within = (value, lo, hi, label) => assert.ok(value >= lo && value <= hi, `${label}=${value} fuera de [${lo}, ${hi}]`);

const VALIDATORS = {
  A(input) {
    const [head, rowA, rowB, ...extra] = lines(input);
    assert.equal(extra.length, 0);
    const [n, m, k] = head.split(' ').map(Number);
    within(n, 1, 2e5, 'n'); within(m, 1, 2e5, 'm'); within(k, 0, 1e9, 'k');
    const a = rowA.split(' ').map(Number); const b = rowB.split(' ').map(Number);
    assert.equal(a.length, n); assert.equal(b.length, m);
    for (const v of [...a, ...b]) within(v, 1, 1e9, 'valor');
  },
  B(input) {
    const [head, row] = lines(input);
    const [n, x] = head.split(' ').map(Number);
    within(n, 1, 100, 'n'); within(x, 1, 1e6, 'x');
    const coins = row.split(' ').map(Number);
    assert.equal(coins.length, n); assert.equal(new Set(coins).size, n, 'monedas repetidas');
    for (const c of coins) within(c, 1, 1e6, 'moneda');
  },
  C(input) {
    const [head, ...rows] = lines(input);
    const n = Number(head);
    within(n, 1, 2e5, 'n'); assert.equal(rows.length, n);
    for (const row of rows) { const [a, b] = row.split(' ').map(Number); within(a, 1, 1e9, 'a'); within(b, a, 1e9, 'b'); }
  },
  D(input) { assert.equal(lines(input).length, 1); within(Number(input), 1, 1e6, 'n'); },
  E(input) {
    const [head, row] = lines(input);
    const [n, x] = head.split(' ').map(Number);
    within(n, 1, 20, 'n'); within(x, 1, 1e9, 'x');
    const w = row.split(' ').map(Number); assert.equal(w.length, n);
    for (const v of w) within(v, 1, x, 'peso');
  },
  F(input) {
    const [head, row, range] = lines(input);
    const [N, K] = head.split(' ').map(Number);
    within(N, 1, 50, 'N'); within(K, 1, N, 'K');
    const p = row.split(' ').map(BigInt).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    assert.equal(p.length, N);
    for (const v of p) assert.ok(v >= 1n && v <= 10n ** 18n);
    for (let i = 1; i < N; i += 1) assert.ok(p[i] >= 2n * p[i - 1], 'cada caja mas pesada debe pesar al menos el doble');
    const [A, B] = range.split(' ').map(BigInt);
    assert.ok(A >= 1n && A <= B && B <= 2n * 10n ** 18n);
  },
  G(input) {
    const [head, row] = lines(input);
    const N = Number(head);
    within(N, 4, 200, 'N'); assert.equal(N % 2, 0);
    const v = row.split(' ').map(Number); assert.equal(v.length, N);
    for (const x of v) within(x, -10000, 10000, 'valor');
  },
  H(input) { assert.equal(lines(input).length, 1); const n = BigInt(input.trim()); assert.ok(n >= 0n && n <= 10n ** 18n); },
  I(input) {
    assert.equal(lines(input).length, 1);
    const w = input.trim();
    assert.match(w, /^[A-Z]{1,100}$/); assert.ok([...w].some((ch) => VOWELS.includes(ch)), 'sin vocales');
  },
  J(input) {
    const [N, K, A] = tokens(input).map(Number);
    within(N, 1, 1e6, 'N'); within(K, 0, 1e6, 'K'); within(A, 2, 26, 'A');
  },
  T(input) { const [a, b] = tokens(input).map(Number); within(a, -1000, 1000, 'a'); within(b, -1000, 1000, 'b'); },
};

for (const exercise of EXERCISES) {
  test(`exercise ${exercise.id}: every input respects the statement constraints`, () => {
    for (const entry of exercise.tests) {
      try { VALIDATORS[exercise.id](entry.input); } catch (error) { error.message = `${exercise.id}/${entry.name}: ${error.message}`; throw error; }
    }
  });
}

// ---------------------------------------------------------------- comportamiento del comprobador (se conserva)
test('exact-output exercises compare tokens and ignore whitespace', () => {
  const exercise = byId('A');
  assert.equal(validateOutput(exercise, exercise.tests[0], ' 2\n'), true);
  assert.equal(validateOutput(exercise, exercise.tests[0], '3\n'), false);
});

test('room checker accepts any valid minimum assignment', () => {
  const exercise = byId('C');
  assert.equal(validateOutput(exercise, exercise.tests[0], '2\n2 1 2\n'), true);
  assert.equal(validateOutput(exercise, exercise.tests[0], '1\n1 1 1\n'), false);
  assert.equal(validateOutput(exercise, exercise.tests[0], '3\n1 2 3\n'), false);
});

test('room checker enforces strict departure-before-arrival', () => {
  const exercise = byId('C');
  assert.equal(validateOutput(exercise, exercise.tests[0], '2\n1 1 2\n'), false);
});

test('penalty increases once per three wrong submissions and caps at nine', () => {
  assert.equal(calculatePenalty(0), 0);
  assert.equal(calculatePenalty(2), 0);
  assert.equal(calculatePenalty(3), 1);
  assert.equal(calculatePenalty(6), 2);
  assert.equal(calculatePenalty(27), 9);
  assert.equal(calculatePenalty(100), 9);
});

// ---------------------------------------------------------------- segunda implementacion INDEPENDIENTE (JavaScript)
// Las salidas esperadas se calcularon con soluciones de referencia en Python/C++ validadas contra fuerza bruta.
// Estas implementaciones en otro lenguaje vuelven a calcularlas para detectar cualquier error en los datos.
const MOD = 1000000007;
const P998 = 998244353;
const mulmod = (a, b, p) => (((a * (b >>> 15)) % p) * 32768 + a * (b & 32767)) % p;
const powmod = (base, exp, p) => { let r = 1; let b = base % p; let e = exp; while (e > 0) { if (e & 1) r = mulmod(r, b, p); b = mulmod(b, b, p); e = Math.floor(e / 2); } return r; };

function solveA(input) {
  const t = tokens(input).map(Number); const [n, m, k] = t;
  const a = Float64Array.from(t.slice(3, 3 + n)).sort(); const b = Float64Array.from(t.slice(3 + n, 3 + n + m)).sort();
  let i = 0; let j = 0; let count = 0;
  while (i < n && j < m) {
    const d = a[i] - b[j];
    if (Math.abs(d) <= k) { count += 1; i += 1; j += 1; } else if (d > k) j += 1; else i += 1;
  }
  return `${count}\n`;
}

function solveB(input) {
  const t = tokens(input).map(Number); const n = t[0]; const x = t[1];
  const dp = new Int32Array(x + 1); dp[0] = 1;
  for (const c of t.slice(2, 2 + n)) for (let s = c; s <= x; s += 1) { const v = dp[s] + dp[s - c]; dp[s] = v >= MOD ? v - MOD : v; }
  return `${dp[x]}\n`;
}

function solveD(input) {
  let n = Number(input.trim()); const out = [n];
  while (n !== 1) { n = n % 2 === 0 ? n / 2 : 3 * n + 1; out.push(n); }
  return `${out.join(' ')}\n`;
}

function solveE(input) {
  const t = tokens(input).map(Number); const n = t[0]; const x = t[1]; const w = t.slice(2, 2 + n);
  const size = 1 << n; const rides = new Int32Array(size).fill(1e9); const last = new Float64Array(size); rides[0] = 1;
  for (let mask = 1; mask < size; mask += 1) {
    for (let i = 0; i < n; i += 1) {
      if (!((mask >> i) & 1)) continue;
      const prev = mask ^ (1 << i); let r = rides[prev]; let l = last[prev];
      if (l + w[i] <= x) l += w[i]; else { r += 1; l = w[i]; }
      if (r < rides[mask] || (r === rides[mask] && l < last[mask])) { rides[mask] = r; last[mask] = l; }
    }
  }
  return `${rides[size - 1]}\n`;
}

function solveF(input) {
  const [head, row, range] = lines(input);
  const K = Number(head.split(' ')[1]);
  const p = row.split(' ').map(BigInt).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const [A, B] = range.split(' ').map(BigInt);
  const C = Array.from({ length: 52 }, () => Array(52).fill(0n));
  for (let i = 0; i < 52; i += 1) { C[i][0] = 1n; for (let j = 1; j <= i; j += 1) C[i][j] = C[i - 1][j - 1] + C[i - 1][j]; }
  const sum = (from, to) => p.slice(from, to).reduce((s, v) => s + v, 0n);
  const countLe = (limit) => {
    const rec = (i, k, T) => {
      if (k < 0 || T < 0n || i < k) return 0n;
      if (k === 0) return 1n;
      if (sum(i - k, i) <= T) return C[i][k];
      if (sum(0, k) > T) return 0n;
      let r = rec(i - 1, k, T);
      if (T >= p[i - 1]) r += rec(i - 1, k - 1, T - p[i - 1]);
      return r;
    };
    return rec(p.length, K, limit);
  };
  return `${countLe(B) - countLe(A - 1n)}\n`;
}

function solveG(input) {          // fuerza bruta: solo para N <= 12
  const values = tokens(input).slice(1).map(Number).sort((a, b) => a - b); const seen = new Set();
  const collinear = (pts) => {
    const unique = [...new Map(pts.map((p) => [p.join(','), p])).values()];
    if (unique.length <= 2) return true;
    const [a, b] = unique;
    return unique.slice(2).every((c) => (b[0] - a[0]) * (c[1] - a[1]) === (b[1] - a[1]) * (c[0] - a[0]));
  };
  const rec = (rem, pts) => {
    if (rem.length === 0) { if (collinear(pts)) seen.add(pts.map((p) => p.join(',')).sort().join('|')); return; }
    const [v, ...rest] = rem; const tried = new Set();
    for (let i = 0; i < rest.length; i += 1) {
      const w = rest[i]; if (tried.has(w)) continue; tried.add(w);
      const others = rest.slice(0, i).concat(rest.slice(i + 1));
      rec(others, [...pts, [v, w]]);
      if (v !== w) rec(others, [...pts, [w, v]]);
    }
  };
  rec(values, []);
  return `${seen.size % MOD}\n`;
}

function solveH(input) {
  let a = 0; let b = 1;
  for (const bit of BigInt(input.trim()).toString(2)) {
    const c = mulmod(a, (2 * b - a + MOD) % MOD, MOD); const d = (mulmod(a, a, MOD) + mulmod(b, b, MOD)) % MOD;
    if (bit === '1') { a = d; b = (c + d) % MOD; } else { a = c; b = d; }
  }
  return `${a}\n`;
}

function solveI(input) {
  const w = input.trim(); const originals = new Set();
  for (let i = 0; i + 4 < w.length; i += 1) {
    if (VOWELS.includes(w[i]) && w.slice(i + 1, i + 4) === 'GAS' && w[i + 4] === w[i]) originals.add(w.slice(0, i) + w[i] + w.slice(i + 5));
  }
  return `${originals.size === 0 ? '-' : originals.size === 1 ? [...originals][0] : '+'}\n`;
}

function solveJ(input) {
  const [N, K, A] = tokens(input).map(Number);
  if (K > Math.max(0, N - 2)) return '0\n';
  const fact = new Int32Array(N + 2); fact[0] = 1;
  for (let i = 1; i <= N + 1; i += 1) fact[i] = mulmod(fact[i - 1], i, P998);
  const inv = new Int32Array(N + 2); inv[N + 1] = powmod(fact[N + 1], P998 - 2, P998);
  for (let i = N + 1; i > 0; i -= 1) inv[i - 1] = mulmod(inv[i], i, P998);
  const choose = (n, r) => (r < 0 || r > n ? 0 : mulmod(mulmod(fact[n], inv[r], P998), inv[n - r], P998));
  const pw = new Int32Array(N + 2); pw[0] = 1;
  for (let i = 1; i <= N + 1; i += 1) pw[i] = mulmod(pw[i - 1], A - 1, P998);
  const ways = (L, j) => (L === 0 ? (j === 0 ? 1 : 0) : (j < 0 || j > L - 1 ? 0 : mulmod(mulmod(A, choose(L - 1, j), P998), pw[L - 1 - j], P998)));
  const L1 = Math.ceil(N / 2); const L2 = Math.floor(N / 2);
  let total = 0;
  for (let j = 0; j <= K; j += 1) total = (total + mulmod(ways(L1, j), ways(L2, K - j), P998)) % P998;
  return `${total}\n`;
}

const REFERENCES = {
  A: solveA, B: solveB, D: solveD, E: solveE, F: solveF, H: solveH, I: solveI, J: solveJ,
  T: (input) => { const [a, b] = tokens(input).map(Number); return `${a + b}\n`; },
};

for (const [id, solve] of Object.entries(REFERENCES)) {
  test(`exercise ${id}: expected outputs match an independent second implementation`, () => {
    for (const entry of byId(id).tests) {
      assert.equal(solve(entry.input), entry.output, `${id}/${entry.name}`);
    }
  });
}

test('exercise G: small cases match an independent brute force (N <= 12)', () => {
  let checked = 0;
  for (const entry of byId('G').tests) {
    if (Number(entry.input.split('\n')[0]) > 12) continue;
    assert.equal(solveG(entry.input), entry.output, `G/${entry.name}`);
    checked += 1;
  }
  assert.ok(checked >= 10);
});

// ---------------------------------------------------------------- ejercicio C: el comprobador acepta una solucion correcta y rechaza una incorrecta
function solveRooms(input) {
  const t = tokens(input).map(Number); const n = t[0];
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => t[1 + 2 * x] - t[1 + 2 * y]);
  const heap = [];                                   // monticulo minimo de [salida, habitacion]
  const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0]; const end = heap.pop();
    if (heap.length) { heap[0] = end; let i = 0; for (;;) { let s = i; const l = 2 * i + 1; const r = l + 1; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } }
    return top;
  };
  const room = new Array(n); let rooms = 0;
  for (const i of order) {
    const arrival = t[1 + 2 * i]; const departure = t[2 + 2 * i]; let r;
    if (heap.length && heap[0][0] < arrival) r = pop()[1]; else { rooms += 1; r = rooms; }
    room[i] = r; push([departure, r]);
  }
  return { rooms, text: `${rooms}\n${room.join(' ')}\n` };
}

test('exercise C: the checker accepts a correct solution on every case and rejects a single-room answer', () => {
  const exercise = byId('C');
  for (const entry of exercise.tests) {
    const { rooms, text } = solveRooms(entry.input);
    assert.equal(validateOutput(exercise, entry, text), true, `C/${entry.name} (solucion correcta rechazada)`);
    assert.ok(Buffer.byteLength(text) <= OUTPUT_GUARD, `C/${entry.name} una salida valida podria superar el limite de salida del juez`);
    if (rooms > 1) {
      const n = Number(entry.input.split('\n')[0]);
      assert.equal(validateOutput(exercise, entry, `1\n${new Array(n).fill(1).join(' ')}\n`), false, `C/${entry.name} (respuesta de una sola habitacion aceptada)`);
    }
  }
});

test('large cases (A and C) are generated lazily and deterministically', () => {
  for (const id of ['A', 'C']) {
    const generated = byId(id).tests.filter((entry) => entry.name.startsWith('max-') || entry.name.startsWith('n100000'));
    assert.ok(generated.length >= 5, `exercise ${id}`);
    for (const entry of generated) {
      const first = entry.input; const second = entry.input;       // cada lectura vuelve a generar la entrada
      assert.equal(first, second, `${id}/${entry.name}`);
      assert.ok(first.length > 8000, `${id}/${entry.name} deberia ser un caso grande`);
    }
  }
});

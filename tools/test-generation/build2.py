"""Parte 2: casos de F, G, H, I, J y T."""
import random, itertools
from refs import *
from g_ref import solve_g
from build1 import mk

# ------------------------------------------------------------------ F
def F_text(p, K, A, B): return f"{len(p)} {K}\n{' '.join(map(str,p))}\n{A} {B}\n"
def doubling(rng, N, cap=10**18, growth=0.35, floor=None):
    for _ in range(100000):
        p = [rng.randint(1, 4)]
        for _ in range(N-1): p.append(2*p[-1] + rng.randint(0, int(p[-1]*growth)))
        if p[-1] <= cap and (floor is None or p[-1] >= floor): return p
    raise RuntimeError('no se pudo generar')
def build_F():
    T = []
    def add(name, p, K, A, B, shuffle=True, seed=0):
        p = list(p)
        if shuffle: random.Random(seed).shuffle(p)
        assert all(2*x <= y for x, y in zip(sorted(p), sorted(p)[1:])), name       # garantia del enunciado
        assert 1 <= A <= B <= 2*10**18 and all(1 <= v <= 10**18 for v in p) and len(set(p)) == len(p)
        T.append(mk(name, F_text(p, K, A, B)))
    add('ejemplo-1', [10,1,3], 2, 4, 13, shuffle=False)
    add('ejemplo-2', [14,70,3,1,6,31], 3, 10, 74, shuffle=False)
    add('n1-dentro-del-rango', [5], 1, 5, 5)
    add('n1-fuera-del-rango', [5], 1, 6, 10)
    add('k-igual-n-dentro', [1,3,8,20], 4, 32, 32, seed=1)
    add('k-igual-n-fuera', [1,3,8,20], 4, 33, 100, seed=2)
    add('k1-todas-las-cajas', [1,3,8,20,45,100], 1, 1, 100, seed=3)
    add('k1-rango-medio', [1,3,8,20,45,100], 1, 5, 50, seed=4)
    add('limites-incluidos', [1,3,8,20,45], 2, 4, 28, seed=5)          # 1+3=4 y 8+20=28 exactos
    add('a-igual-b-suma-existente', [1,3,8,20,45], 3, 12, 12, seed=6)   # 1+3+8
    add('a-igual-b-sin-suma', [1,3,8,20,45], 3, 13, 13, seed=7)
    p = [1,2,4,8,16,32,64,128,256,512]; add('potencias-de-2-k5', p, 5, 100, 700, seed=8)
    add('todas-las-sumas-posibles', p, 4, 1, 2*10**18, seed=9)
    add('a-mayor-que-suma-total', p, 3, 2000, 3000, seed=10)
    for s in range(1, 9):
        r = random.Random(11000+s); N = r.randint(2, 12); p = doubling(r, N); K = r.randint(1, N)
        tot = sum(p); A = r.randint(1, tot); B = r.randint(A, tot + 2)
        add(f'aleatorio-pequeno-{s}', p, K, A, B, seed=s)
    for s in range(1, 7):
        r = random.Random(12000+s); N = r.randint(14, 30); p = doubling(r, N); K = r.randint(3, N-3)
        subs = [sum(r.sample(sorted(p), K)) for _ in range(2)]; A, B = min(subs), max(subs)
        add(f'aleatorio-mediano-limites-exactos-{s}', p, K, A, B, seed=s)
    r = random.Random(13000); p = doubling(r, 50, growth=0.0)
    add('n50-potencias-exactas-k25-todo', p, 25, 1, 2*10**18, seed=11)
    add('n50-k1', p, 1, 1, 2*10**18, seed=12)
    add('n50-k50', p, 50, 1, 2*10**18, seed=13)
    add('n50-k2-rango-medio', p, 2, 10**6, 10**13, seed=14)
    for s in range(1, 5):
        r = random.Random(14000+s); p = doubling(r, 50, growth=0.5, floor=2*10**17); K = r.choice([10, 17, 25, 33])
        subs = sorted(sum(r.sample(sorted(p), K)) for _ in range(2)); A, B = subs
        add(f'n50-pesos-hasta-1e18-{s}', p, K, A, min(B, 2*10**18), seed=20+s)
    r = random.Random(15000); p = doubling(r, 50, growth=0.5, floor=3*10**17)
    add('n50-k25-suma-total-casi-2e18', p, 25, sum(p)//3, min(2*10**18, sum(p)), seed=30)
    add('n50-b-maximo-2e18', p, 20, 1, 2*10**18, seed=31)
    return T

# ------------------------------------------------------------------ G
def G_text(v): return f"{len(v)}\n{' '.join(map(str,v))}\n"
def line_values(rng, N, p, q, c, distinct_x=True, lo=-10000, hi=10000, tmax=None):
    """N/2 puntos sobre y = (p/q)*x + c con x multiplo de q; devuelve los N valores mezclados."""
    h = N // 2; vals = None
    for _ in range(10000):
        ts = rng.sample(range(-(tmax or 200), (tmax or 200)+1), h) if distinct_x else [rng.randint(-5, 5) for _ in range(h)]
        pts = [(q*t, p*t + c) for t in ts]
        v = [a for pt in pts for a in pt]
        if all(lo <= a <= hi for a in v): vals = v; break
    assert vals is not None
    rng.shuffle(vals); return vals
def build_G():
    cand = []; add = lambda name, v: cand.append((name, list(v)))
    add('ejemplo-1', [1,2,3,5,20,18,16,12]); add('ejemplo-2', [1,2,5,5,5,5,8,9])
    add('n4-todos-iguales', [3,3,3,3]); add('n4-dos-pares', [1,1,2,2]); add('n4-distintos', [1,2,3,4])
    add('n4-tres-iguales', [0,0,0,5]); add('n4-simetricos', [-5,-5,5,5]); add('n4-uno-repetido', [1,2,3,3])
    add('n4-extremos', [-10000,10000,-10000,10000]); add('n4-negativos', [-7,-3,-9,-1])
    add('n6-progresion', [1,2,3,4,5,6]); add('n6-con-ceros', [0,0,1,1,2,2])
    add('n6-no-colineal', [1,2,4,8,16,32]); add('n8-simetria-m-menos-1', [1,9,2,8,3,7,4,6])
    add('n200-todos-iguales-cero', [0]*200); add('n200-todos-iguales-extremo', [10000]*200)
    add('n200-todos-iguales-negativo', [-10000]*200)
    for s in range(1, 7):                                       # N<=12, rangos chicos (muchos repetidos): se verifican con fuerza bruta
        r = random.Random(16000+s); N = r.choice([6, 8, 10, 12]); R = r.choice([3, 4, 6])
        add(f'aleatorio-pequeno-{s}', [r.randint(0, R) for _ in range(N)])
    for s, (p, q, c) in enumerate([(2,1,3),(-2,1,5),(1,2,-1),(3,2,4),(-3,1,0),(5,3,-2),(1,1,7),(-1,1,100),(7,1,0),(1,3,2)], 1):
        r = random.Random(17000+s); N = r.choice([20, 40, 80, 120, 200])
        add(f'colineal-pendiente-{p}-{q}-n{N}', line_values(r, N, p, q, c, tmax=150 if q == 1 else 300))
    for s in range(1, 5):                                       # N=200 con los 200 valores distintos y colineales
        r = random.Random(18000+s); p, q = r.choice([(2,1),(-1,1),(3,1),(1,2),(-2,1)]); c = r.randint(-50, 50)
        add(f'n200-distintos-colineales-{s}', line_values(r, 200, p, q, c, tmax=450 if q == 1 else 600))
    for s in range(1, 4):                                       # pendiente -1: 2^pares conjuntos (usa el modulo)
        r = random.Random(19000+s); k = r.randint(-300, 300); h = 100
        xs = r.sample(range(abs(k)//2 + 1 if k % 2 == 0 else abs(k)//2 + 1, abs(k)//2 + 5000), h)
        xs = [x + (k//2) for x in xs]; v = xs + [k - x for x in xs]; r.shuffle(v); add(f'n200-simetricos-m-menos-1-{s}', v)
    r = random.Random(19100); v = [r.randint(1, 30) for _ in range(100)]; add('n200-identidad-pares', v + v)   # y=x
    r = random.Random(19200); add('n200-vertical-mas-distintos', [42]*100 + r.sample(range(-9000, 9000), 100))
    r = random.Random(19300); add('n200-horizontal-con-repetidos', [-7]*105 + [r.randint(-50, 50) for _ in range(95)])
    r = random.Random(19400); add('n200-aleatorio-sin-solucion', r.sample(range(-10000, 10001), 200))
    r = random.Random(19500); add('n200-rango-muy-chico', [r.randint(0, 4) for _ in range(200)])
    r = random.Random(19600); add('n200-pocos-valores-distintos', [r.choice([0, 1, 2, 3]) for _ in range(200)])
    r = random.Random(19700); add('n200-casi-colineal-un-error', line_values(r, 200, 2, 1, 3, tmax=200)[:-1] + [9999])
    # filtrado: solo se conservan casos cuyo resultado NO depende de como se cuenten los puntos repetidos
    from g_variants import brute_variants
    T, dropped = [], []
    for name, v in cand:
        multi, coll = solve_g(v)
        if multi != coll: dropped.append((name, multi, coll)); continue
        if len(v) <= 12: assert brute_variants(v)[0] == multi, (name, v)
        T.append(mk(name, G_text(v)))
    return T, dropped

# ------------------------------------------------------------------ H
def build_H():
    r = random.Random(20000)
    ns = [0,1,2,3,4,5,10,20,50,90,92,93,100,1000,12345,10**6,10**9,10**9+6,10**9+7,10**9+8,2000000015,2000000016,2000000017,
          10**12,10**15,10**17,2**58,2**59,10**18-1,10**18,999999999999999989]
    extra = []
    while len(extra) < 6:
        v = r.randint(1, 10**18)
        if v not in ns: extra.append(v)
    return [mk(f'n-{n}', f"{n}\n") for n in ns + extra]

# ------------------------------------------------------------------ I
def i_robust(w):
    s1, s2 = i_originals_one(w), i_originals_subset(w)
    return i_answer(s1) == i_answer(s2) and len(i_patterns(w)) <= 18
def build_I():
    cand = []; add = lambda name, w: cand.append((name, w))
    add('ejemplo-1', 'ROSARIGASINO'); add('ejemplo-2', 'PRALINE'); add('ejemplo-3', 'AGASAJOGASO')
    add('una-letra', 'A'); add('solo-el-patron-a', 'AGASA'); add('solo-el-patron-e', 'EGASE'); add('solo-el-patron-i', 'IGASI')
    add('solo-el-patron-o', 'OGASO'); add('solo-el-patron-u', 'UGASU'); add('vocales-distintas', 'AGASE'); add('gas-sin-vocal-despues', 'AGAS')
    add('gas-sin-vocal-antes', 'GASA'); add('gas-entre-consonantes', 'BGASB'); add('patron-al-inicio', 'AGASABC')
    add('patron-al-final', 'XYZIGASI'); add('patron-en-el-medio', 'MAMAGASAMA'); add('dos-patrones-contiguos', 'AGASAAGASA')
    add('solapados-dos', 'AGASAGASA'); add('gas-repetido-sin-patron', 'AGASGASGAS'); add('consonantes-y-una-vocal', 'BCDFGE')
    add('palabra-sin-gas', 'ROSARIO'); add('gas-mal-escrito', 'AGSAA'); add('minusculas-parecidas', 'AGASAGAZA')
    add('dos-patrones-distintos-vocales', 'EGASEXOGASO'); add('tres-patrones-separados', 'AGASABEGASEBOGASO')
    add('patron-con-vocal-extra', 'AAGASAA'); add('gas-doble-vocal', 'UGASUGASU')
    r = random.Random(21000); V = 'AEIOU'; C = 'BCDFGHJKLMNPQRSTVWXYZ'
    def rand_base(L):
        w = ''.join(r.choice(V) if r.random() < 0.35 else r.choice(C) for _ in range(L))
        return w if any(ch in V for ch in w) else w[:-1] + 'A'
    def transform(w, k):
        pos = [i for i, ch in enumerate(w) if ch in V]; chosen = sorted(r.sample(pos, min(k, len(pos))), reverse=True)
        for i in chosen: w = w[:i] + w[i] + 'GAS' + w[i] + w[i+1:]
        return w
    for s in range(1, 9): add(f'aleatorio-uno-{s}', transform(rand_base(r.randint(5, 24)), 1))
    for s in range(1, 5): add(f'aleatorio-uno-largo-{s}', transform(rand_base(r.randint(70, 95)), 1))
    for s in range(1, 5): add(f'aleatorio-varios-{s}', transform(rand_base(r.randint(12, 30)), r.randint(2, 4)))
    for s in range(1, 4): add(f'aleatorio-ninguno-{s}', rand_base(r.randint(6, 40)))
    add('longitud-100-un-patron', 'B'*47 + 'AGASA' + 'C'*48)
    add('longitud-100-sin-patron', ('BA'*50))
    add('longitud-100-muchos-patrones', ('AGASA' + 'B')*15 + 'EGASE' + 'B'*5)
    add('longitud-1-consonante-vocal', 'E')
    T, dropped = [], []
    for name, w in cand:
        assert 1 <= len(w) <= 100 and w.isalpha() and w.isupper() and any(ch in 'AEIOU' for ch in w), (name, w)
        if not i_robust(w): dropped.append((name, w)); continue
        T.append(mk(name, w + "\n"))
    return T, dropped

# ------------------------------------------------------------------ J
def build_J():
    L = [(3,1,2),(5,2,3),(2,1,26),(1,0,2),(1,0,26),(1,1,5),(2,0,2),(2,0,26),(3,0,2),(3,1,26),(4,0,3),(4,1,3),(4,2,3),(5,3,2),
         (5,0,26),(6,2,2),(7,3,4),(10,4,3),(10,8,2),(10,9,5),(20,0,2),(20,18,26),(30,10,7),(100,50,2),(1000,333,26),
         (1000,998,13),(1000,999,13),(100000,50000,2),(999999,499999,3),(1000000,0,2),(1000000,0,26),(1000000,999998,26),
         (1000000,999999,26),(1000000,500000,2),(1000000,333333,13),(999999,1,26),(1000000,1000000,2),(1000000,123456,17)]
    r = random.Random(22000)
    for _ in range(4):
        N = r.randint(1000, 10**6); L.append((N, r.randint(0, N-2), r.randint(2, 26)))
    return [mk(f'n{N}-k{K}-a{A}', f"{N} {K} {A}\n") for N, K, A in L]

# ------------------------------------------------------------------ T (demostrativo)
def build_T():
    L = [(3,4),(0,0),(-5,-7),(1000,1000),(123,-456),(-1000,-1000),(999,-1000)]
    return [mk(f'suma-{a}-{b}', f"{a} {b}\n") for a, b in L]

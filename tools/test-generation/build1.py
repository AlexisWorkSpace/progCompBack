"""Parte 1: construccion de los casos de A, B, C, D, E (entradas)."""
import random, subprocess, json
from refs import *

LIT_MAX = 8000   # entradas de hasta 8000 caracteres se guardan literales; mas grandes se generan al vuelo

def node_input(gen, params):
    return subprocess.run(['node', 'gen_cli.js', json.dumps({'gen': gen, 'params': params})],
                          capture_output=True, text=True, check=True).stdout

def mk(name, inp=None, gen=None, params=None):
    return dict(name=name, input=inp, gen=gen, params=params)

# ------------------------------------------------------------------ A
def A_text(a, b, k): return f"{len(a)} {len(b)} {k}\n{' '.join(map(str,a))}\n{' '.join(map(str,b))}\n"
def build_A():
    T = []; lit = lambda name, a, b, k: T.append(mk(name, A_text(a, b, k)))
    lit('ejemplo', [60,45,80,60], [30,60,75], 5)
    lit('n1-m1-iguales-k0', [7], [7], 0)
    lit('n1-m1-difieren-1-k0', [7], [8], 0)
    lit('diferencia-exacta-k', [100], [105], 5)
    lit('diferencia-k-mas-uno', [100], [106], 5)
    lit('un-solicitante-varios-apartamentos', [50], [1,100,49,200,51], 1)
    lit('varios-solicitantes-un-apartamento', [50,51,52,53], [52], 2)
    lit('k-maximo-todos-coinciden', [1,1000000000,500000000], [1000000000,1,7,999999999,2], 1000000000)
    lit('ninguno-coincide', [1,2,3,4], [1000,2000,3000], 10)
    lit('valores-iguales-k0', [7]*7, [7]*4, 0)
    lit('multiplicidades-k0', [5,5,5,9], [5,5,9,9,9], 0)
    lit('trampa-voraz-orden-entrada-1', [20,10], [15,25], 5)
    lit('trampa-voraz-orden-entrada-2', [10,30,20], [25,15,35], 5)
    lit('valores-limite-k0', [1000000000,1,1000000000], [1000000000,1000000000,2], 0)
    lit('entrada-ordenada-descendente', [90,80,70,60,50], [95,85,55,45], 6)
    lit('cadena-de-dependencias', [10,20,30,40], [15,25,35,45,5], 5)
    for s in range(1, 9):
        r = random.Random(1000+s); n, m = r.randint(1,8), r.randint(1,8); R = r.choice([6,20,100]); k = r.randint(0, R//3)
        lit(f'aleatorio-pequeno-{s}', [r.randint(1,R) for _ in range(n)], [r.randint(1,R) for _ in range(m)], k)
    for s, (n, m, k) in enumerate([(150,200,0),(220,180,3),(300,300,25),(260,140,400)], 1):
        r = random.Random(2000+s)
        lit(f'aleatorio-mediano-{s}', [r.randint(1,1000) for _ in range(n)], [r.randint(1,1000) for _ in range(m)], k)
    G = 'A.make'
    T += [
      mk('max-aleatorio-k1000', gen=G, params=dict(seed=11, n=200000, m=200000, k=1000)),
      mk('max-apartamentos-cercanos-k0', gen=G, params=dict(seed=12, n=200000, m=200000, k=0, mode='close', spread=2)),
      mk('max-un-apartamento', gen=G, params=dict(seed=13, n=200000, m=1, k=500000000)),
      mk('max-un-solicitante', gen=G, params=dict(seed=14, n=1, m=200000, k=5000000)),
      mk('max-valores-iguales-k0', gen=G, params=dict(seed=15, n=200000, m=200000, lo=7, hi=7, k=0)),
      mk('max-k-maximo-m-menor', gen=G, params=dict(seed=16, n=200000, m=100000, k=1000000000)),
      mk('max-rango-pequeno-k0-ordenado-asc', gen=G, params=dict(seed=17, n=200000, m=200000, lo=1, hi=1000, k=0, order='asc')),
      mk('max-aleatorio-k5-descendente', gen=G, params=dict(seed=18, n=200000, m=200000, k=5, hi=2000000, order='desc')),
    ]
    return T

# ------------------------------------------------------------------ B
def B_text(coins, x): return f"{len(coins)} {x}\n{' '.join(map(str,coins))}\n"
def build_B():
    T = []; lit = lambda name, coins, x: T.append(mk(name, B_text(coins, x)))
    lit('ejemplo', [2,3,5], 9)
    lit('n1-moneda1-x1', [1], 1)
    lit('n1-no-divide', [2], 3)
    lit('n1-moneda1-x-maximo', [1], 1000000)
    lit('todas-mayores-que-x', [5,7,9], 4)
    lit('monedas-1-2-x10', [1,2], 10)
    lit('monedas-1-2-x-maximo', [1,2], 1000000)
    lit('solo-pares-x-impar', [2,4,6], 9)
    lit('monedas-1-2-5-x100', [5,1,2], 100)
    lit('monedas-1-y-1000000', [1, 1000000], 1000000)
    lit('moneda-igual-a-x', [999999, 1000000, 3], 1000000)
    lit('x1-varias-monedas', [3,1,2,4], 1)
    lit('monedas-desordenadas', [10,3,7,1,5], 50)
    lit('multiplos-de-3-x-no-multiplo', [3,6,9,12], 1000)
    lit('monedas-grandes-sin-solucion', [999983, 999979], 999982)
    for s in range(1, 9):
        r = random.Random(3000+s); n = r.randint(1,5); coins = r.sample(range(1, 13), n); lit(f'aleatorio-pequeno-{s}', coins, r.randint(1, 40))
    for s in range(1, 7):
        r = random.Random(4000+s); n = r.randint(8, 30); lit(f'aleatorio-mediano-{s}', r.sample(range(1, 3000), n), r.randint(1000, 100000))
    lit('max-n100-monedas-1-a-100', list(range(1, 101)), 1000000)
    lit('max-n100-monedas-grandes', list(range(1000000-99, 1000001)), 1000000)
    for s in range(1, 5):
        r = random.Random(5000+s); lit(f'max-n100-aleatorio-{s}', r.sample(range(1, 1000001), 100), 1000000)
    r = random.Random(5100); lit('max-n100-monedas-pequenas', r.sample(range(1, 400), 100), 1000000)
    r = random.Random(5200); lit('max-n100-multiplos-de-7', [7*i for i in r.sample(range(1, 142857), 100)], 999999)
    return T

# ------------------------------------------------------------------ C
def C_text(pairs): return f"{len(pairs)}\n" + '\n'.join(f"{a} {b}" for a, b in pairs) + "\n"
def build_C():
    T = []; lit = lambda name, pairs: T.append(mk(name, C_text(pairs)))
    lit('ejemplo', [(1,2),(2,4),(4,4)])
    lit('n1', [(5,5)])
    lit('n1-intervalo-largo', [(1,1000000000)])
    lit('dos-identicos', [(3,9),(3,9)])
    lit('dos-tocandose-salida-igual-llegada', [(1,2),(2,3)])
    lit('dos-con-hueco-de-uno-comparten', [(1,2),(3,4)])
    lit('dos-puntos-iguales', [(5,5),(5,5)])
    lit('dos-puntos-consecutivos', [(5,5),(6,6)])
    lit('anidados', [(1,100),(2,50),(3,10),(4,5)])
    lit('cadena-tocandose', [(i, i+1) for i in range(1, 13)])
    lit('cadena-con-hueco-de-uno', [(1+2*i, 2+2*i) for i in range(12)])
    lit('diez-identicos', [(7,20)]*10)
    lit('orden-de-entrada-invertido', [(30,40),(20,25),(10,15),(1,12)])
    lit('limite-superior-del-rango', [(999999999,1000000000),(1000000000,1000000000),(1,1000000000)])
    lit('llegadas-iguales-salidas-distintas', [(5,6),(5,10),(5,7),(5,5),(8,9)])
    for s in range(1, 9):
        r = random.Random(6000+s); n = r.randint(2, 12); mt = r.choice([10, 30, 100])
        lit(f'aleatorio-pequeno-{s}', [(a, min(mt, a + r.randint(0, 6))) for a in (r.randint(1, mt) for _ in range(n))])
    for s in range(1, 7):
        r = random.Random(7000+s); n = r.randint(60, 250); mt = r.choice([200, 1000, 100000])
        lit(f'aleatorio-mediano-{s}', [(a, min(mt, a + r.randint(0, r.choice([3, 20, mt//5])))) for a in (r.randint(1, mt) for _ in range(n))])
    G = 'C.make'
    T += [
      mk('max-aleatorio', gen=G, params=dict(seed=21, n=200000, mode='random', maxT=1000000000, maxLen=10000000)),
      mk('max-aleatorio-denso', gen=G, params=dict(seed=22, n=200000, mode='random', maxT=1000000, maxLen=100)),
      mk('max-disjuntos', gen=G, params=dict(seed=23, n=200000, mode='disjoint')),
      mk('max-con-hueco-de-uno', gen=G, params=dict(seed=24, n=200000, mode='gap')),
      mk('max-tocandose', gen=G, params=dict(seed=25, n=200000, mode='touching')),
      mk('max-puntos-repetidos', gen=G, params=dict(seed=26, n=200000, mode='points', maxLen=1000)),
      mk('max-capas', gen=G, params=dict(seed=27, n=200000, mode='layers', layers=7)),
      mk('n100000-identicos', gen=G, params=dict(seed=28, n=100000, mode='identical')),
      mk('n100000-anidados', gen=G, params=dict(seed=29, n=100000, mode='nested')),
    ]
    return T

# ------------------------------------------------------------------ D
def build_D():
    ns = [1,2,3,4,5,6,7,8,9,10,11,12,16,27,97,871,6171,77031,113383,159487,704511,837799,999999,1000000,
          524288,262144,786432,65535,65536,100000,999983,123456,999998,500000,524287,937503]
    r = random.Random(8000); extra = []
    while len(extra) < 4:
        v = r.randint(1, 1000000)
        if v not in ns and v not in extra: extra.append(v)
    return [mk(f'n-{n}', f"{n}\n") for n in ns + extra]

# ------------------------------------------------------------------ E
def E_text(w, x): return f"{len(w)} {x}\n{' '.join(map(str,w))}\n"
def ffd(w, x):
    bins = []
    for v in sorted(w, reverse=True):
        for i in range(len(bins)):
            if bins[i] + v <= x: bins[i] += v; break
        else: bins.append(v)
    return len(bins)
def opt_e(w, x):
    return int(subprocess.run(['./e_ref'], input=E_text(w, x), capture_output=True, text=True).stdout)
def build_E():
    T = []; lit = lambda name, w, x: T.append(mk(name, E_text(w, x)))
    lit('ejemplo', [4,8,6,1], 10)
    lit('n1', [5], 10)
    lit('n1-peso-igual-capacidad', [10], 10)
    lit('20-pesos-igual-capacidad', [10**9]*20, 10**9)
    lit('20-unos-caben-todos', [1]*20, 20)
    lit('20-unos-un-viaje-menos-uno', [1]*20, 19)
    lit('20-mitad-mas-uno', [500000001]*20, 10**9)
    lit('20-exactamente-mitad', [500000000]*20, 10**9)
    lit('20-un-tercio-mas-uno', [333333334]*20, 10**9)
    lit('20-un-tercio', [333333333]*20, 10**9)
    lit('pares-complementarios', [3,7,4,6,2,8,1,9,5,5], 10)
    lit('suma-total-exacta', [1,2,3,4,5,6], 21)
    lit('suma-total-menos-uno', [1,2,3,4,5,6], 20)
    lit('capacidad-1e9-pesos-mixtos', [10**9, 1, 10**9-1, 2, 10**9-2, 3], 10**9)
    # instancias donde el empaquetado voraz FFD NO es optimo (buscadas con semilla fija)
    r = random.Random(9000); found = 0; tries = 0
    while found < 6 and tries < 200000:
        tries += 1; n = r.randint(6, 14); x = r.randint(20, 100); w = [r.randint(x//6, x//2 + 3) for _ in range(n)]
        w = [min(v, x) for v in w]
        if ffd(w, x) > opt_e(w, x):
            found += 1; lit(f'voraz-no-optimo-{found}', w, x)
    assert found == 6, found
    for s in range(1, 7):
        r = random.Random(9100+s); n = r.randint(2, 9); x = r.randint(5, 40); lit(f'aleatorio-pequeno-{s}', [r.randint(1, x) for _ in range(n)], x)
    for s in range(1, 7):
        r = random.Random(9200+s); x = r.choice([10**9, 10**8, 123456789, 999999937]); lit(f'max-n20-aleatorio-{s}', [r.randint(1, x) for _ in range(20)], x)
    r = random.Random(9300); x = 10**9; lit('max-n20-pesos-medianos', [r.randint(x//4, x//2) for _ in range(20)], x)
    r = random.Random(9301); x = 10**9; lit('max-n20-pesos-cercanos-a-x-sobre-3', [r.randint(x//3 - 1000, x//3 + 1000) for _ in range(20)], x)
    return T

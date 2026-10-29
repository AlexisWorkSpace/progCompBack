import random, subprocess, itertools
from refs import *
random.seed(777)
def run(binname, inp): return subprocess.run([binname], input=inp, capture_output=True, text=True).stdout.strip()

# A: emparejamiento maximo por fuerza bruta (aumento de caminos)
def matchA(a, b, k):
    adj = [[j for j in range(len(b)) if abs(a[i]-b[j]) <= k] for i in range(len(a))]
    mt = [-1]*len(b)
    def aug(u, seen):
        for v in adj[u]:
            if v in seen: continue
            seen.add(v)
            if mt[v] == -1 or aug(mt[v], seen): mt[v] = u; return True
        return False
    return sum(aug(u, set()) for u in range(len(a)))
bad = 0
for _ in range(1500):
    n, m = random.randint(1,9), random.randint(1,9); R = random.choice([5,20,100]); k = random.randint(0, R//2)
    a = [random.randint(1,R) for _ in range(n)]; b = [random.randint(1,R) for _ in range(m)]
    inp = f"{n} {m} {k}\n{' '.join(map(str,a))}\n{' '.join(map(str,b))}\n"
    if int(solveA(inp)) != matchA(a,b,k): bad += 1; print("A DIF", inp)
print("A: 1500 casos, diferencias:", bad)

# B: combinaciones sin orden por recursion
def countB(coins, x):
    coins = sorted(coins)
    def rec(i, rem):
        if rem == 0: return 1
        if i == len(coins): return 0
        r = 0; c = coins[i]; t = 0
        while t <= rem: r += rec(i+1, rem-t); t += c
        return r
    return rec(0, x)
bad = 0
for _ in range(500):
    n = random.randint(1,5); coins = random.sample(range(1,13), n); x = random.randint(1,40)
    inp = f"{n} {x}\n{' '.join(map(str,coins))}\n"
    if int(run('./b_ref', inp)) != countB(coins, x) % MOD: bad += 1; print("B DIF", inp)
print("B: 500 casos, diferencias:", bad)

# E: viajes minimos por backtracking de empaquetado
def binpack(w, x):
    best = [len(w)]
    def rec(i, bins):
        if len(bins) >= best[0]: return
        if i == len(w): best[0] = len(bins); return
        for j in range(len(bins)):
            if bins[j] + w[i] <= x:
                bins[j] += w[i]; rec(i+1, bins); bins[j] -= w[i]
        bins.append(w[i]); rec(i+1, bins); bins.pop()
    rec(0, []); return best[0]
bad = 0
for _ in range(800):
    n = random.randint(1,9); x = random.randint(5,30); w = [random.randint(1,x) for _ in range(n)]
    inp = f"{n} {x}\n{' '.join(map(str,w))}\n"
    if int(run('./e_ref', inp)) != binpack(w, x): bad += 1; print("E DIF", inp)
print("E: 800 casos, diferencias:", bad)

# F: combinaciones por fuerza bruta con pesos que cumplen la duplicacion
def gen_doubling(n, lo_mult=2, hi_extra=3, start=1):
    p = [random.randint(start, start+2)]
    while len(p) < n: p.append(p[-1]*2 + random.randint(0, hi_extra*p[-1]//2 + 2))
    return p
bad = 0
for _ in range(1500):
    N = random.randint(1,14); K = random.randint(1,N); p = gen_doubling(N); random.shuffle(p)
    tot = sum(p); A = random.randint(1, tot); B = random.randint(A, tot+3)
    brute = sum(1 for c in itertools.combinations(p, K) if A <= sum(c) <= B)
    inp = f"{N} {K}\n{' '.join(map(str,p))}\n{A} {B}\n"
    if int(solveF(inp)) != brute: bad += 1; print("F DIF", inp)
print("F: 1500 casos, diferencias:", bad)

# J: fuerza bruta por todas las cadenas
bad = 0
for _ in range(400):
    N = random.randint(1,8); A = random.randint(2,4)
    if A**N > 70000: continue
    K = random.randint(0, max(0, N-2)+1)
    cntK = sum(1 for s in itertools.product(range(A), repeat=N) if sum(1 for i in range(N-2) if s[i]==s[i+2]) == K)
    if int(solveJ(f"{N} {K} {A}\n")) != cntK % P998: bad += 1; print("J DIF", N, K, A)
print("J: casos verificados, diferencias:", bad)

# H: comparacion con iteracion directa
a, b = 0, 1; fibs = []
for i in range(3000): fibs.append(a); a, b = b, a+b
print("H: diferencias:", sum(1 for n in list(range(0,200))+[500,1000,2999] if int(solveH(f'{n}\n')) != fibs[n] % MOD))
print("H periodo de Pisano 2*(p+1): F(2000000016) =", solveH('2000000016\n').strip(), ", F(2000000017) =", solveH('2000000017\n').strip())
# D: pico maximo
def peak(n):
    m = n
    while n != 1:
        n = n//2 if n%2==0 else 3*n+1; m = max(m, n)
    return m
print("D: pico de 704511 =", peak(704511), "; 113383 ->", peak(113383), "; 837799 largo:", len(solveD('837799\n').split()))

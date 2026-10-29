"""Soluciones de referencia. Cada solveX(texto_entrada) -> texto_salida (con salto de linea final)."""
import heapq, sys
from collections import Counter
from math import gcd, comb

MOD = 10**9 + 7

def solveA(inp):
    t = inp.split(); n, m, k = int(t[0]), int(t[1]), int(t[2])
    a = sorted(map(int, t[3:3+n])); b = sorted(map(int, t[3+n:3+n+m]))
    i = j = c = 0
    while i < n and j < m:
        d = a[i] - b[j]
        if abs(d) <= k: c += 1; i += 1; j += 1
        elif d > k: j += 1
        else: i += 1
    return f"{c}\n"

def solveC_rooms(inp):
    """Devuelve (k, asignacion) valida (habitacion libre solo si salida < llegada, estricto)."""
    t = list(map(int, inp.split())); n = t[0]
    iv = sorted(((t[1+2*i], t[2+2*i], i) for i in range(n)))
    heap = []; room = [0]*n; k = 0
    for a, b, i in iv:
        if heap and heap[0][0] < a:
            _, r = heapq.heappop(heap)
        else:
            k += 1; r = k
        room[i] = r; heapq.heappush(heap, (b, r))
    return k, room

def solveD(inp):
    n = int(inp.split()[0]); out = [n]
    while n != 1:
        n = n // 2 if n % 2 == 0 else 3*n + 1
        out.append(n)
    return ' '.join(map(str, out)) + "\n"

# ---------- F ----------
def solveF(inp):
    t = inp.split(); N, K = int(t[0]), int(t[1])
    p = sorted(map(int, t[2:2+N])); A, B = int(t[2+N]), int(t[3+N])
    return f"{count_le(p, K, B) - count_le(p, K, A-1)}\n"

def count_le(p, k, T):
    """Numero de subconjuntos de exactamente k elementos de p (ascendente) con suma <= T. Correcto para cualquier p;
    lineal si p cumple 'cada caja pesa al menos el doble que la anterior'."""
    def rec(i, k, T):
        if k < 0 or T < 0 or i < k: return 0
        if k == 0: return 1
        if sum(p[i-k:i]) <= T: return comb(i, k)     # los k mayores caben: todos caben
        if sum(p[:k]) > T: return 0                   # los k menores no caben
        r = rec(i-1, k, T)
        if T >= p[i-1]: r += rec(i-1, k-1, T - p[i-1])
        return r
    return rec(len(p), k, T)

# ---------- H ----------
def fib_pair(n):
    if n == 0: return (0, 1)
    a, b = fib_pair(n >> 1)
    c = a * ((2*b - a) % MOD) % MOD
    d = (a*a + b*b) % MOD
    return (d, (c + d) % MOD) if n & 1 else (c, d)
def solveH(inp):
    return f"{fib_pair(int(inp.split()[0]))[0]}\n"

# ---------- I ----------
VOW = set("AEIOU")
def i_patterns(w):
    return [i for i in range(len(w)-4) if w[i] in VOW and w[i+1:i+4] == "GAS" and w[i+4] == w[i]]
def i_originals_one(w):          # S1: se transformo exactamente una vocal
    return {w[:i] + w[i] + w[i+5:] for i in i_patterns(w)}
def i_originals_subset(w):       # S2: se transformo un subconjunto no vacio de vocales
    pats = i_patterns(w); res = set()
    def rec(idx, last_end, chosen):
        if idx == len(pats):
            if chosen:
                out = []; pos = 0
                for i in chosen:
                    out.append(w[pos:i]); out.append(w[i]); pos = i + 5
                out.append(w[pos:]); res.add(''.join(out))
            return
        rec(idx+1, last_end, chosen)
        if pats[idx] >= last_end: rec(idx+1, pats[idx]+5, chosen + [pats[idx]])
    rec(0, 0, [])
    return res
def i_answer(origs):
    return '-' if not origs else (next(iter(origs)) if len(origs) == 1 else '+')
def solveI(inp):
    return i_answer(i_originals_one(inp.split()[0])) + "\n"

# ---------- J ----------
P998 = 998244353
def solveJ(inp):
    N, K, A = map(int, inp.split())
    F = [1]*(N+2)
    for i in range(1, N+2): F[i] = F[i-1]*i % P998
    IF = [1]*(N+2); IF[N+1] = pow(F[N+1], P998-2, P998)
    for i in range(N+1, 0, -1): IF[i-1] = IF[i]*i % P998
    def C(n, r): return 0 if r < 0 or r > n or n < 0 else F[n]*IF[r] % P998*IF[n-r] % P998
    L1, L2 = (N+1)//2, N//2
    pw = [1]*(N+2)
    for i in range(1, N+2): pw[i] = pw[i-1]*(A-1) % P998
    def f(L, j):                      # secuencias de largo L con exactamente j iguales adyacentes
        if L == 0: return 1 if j == 0 else 0
        if j < 0 or j > L-1: return 0
        return A * C(L-1, j) % P998 * pw[L-1-j] % P998
    if K > max(0, N-2): return "0\n"
    return f"{sum(f(L1, j) * f(L2, K-j) for j in range(0, K+1)) % P998}\n"

def solveT(inp):
    a, b = map(int, inp.split()); return f"{a+b}\n"

import json, re, subprocess
from refs import *
from build1 import ffd
D = json.load(open('tests_dump.json'))
def count(ex, mutant, ref=None):
    bad = []
    for t in D[ex]:
        exp = t['output'] if ref is None else ref(t['input'])
        if mutant(t['input']) != exp: bad.append(t['name'])
    return bad
def A_strict(inp):
    t = inp.split(); n, m, k = int(t[0]), int(t[1]), int(t[2]); a = sorted(map(int, t[3:3+n])); b = sorted(map(int, t[3+n:3+n+m]))
    i = j = c = 0
    while i < n and j < m:
        d = a[i]-b[j]
        if abs(d) < k: c += 1; i += 1; j += 1          # error: < en vez de <=
        elif d > 0: j += 1
        else: i += 1
    return f"{c}\n"
def A_first_fit(inp):
    t = inp.split(); n, m, k = int(t[0]), int(t[1]), int(t[2]); a = list(map(int, t[3:3+n])); b = list(map(int, t[3+n:3+n+m]))
    if n * m > 4_000_000: return None                       # el voraz ingenuo es O(nm): ese caso seria TLE
    used = [False]*m; c = 0
    for x in a:
        for j in range(m):
            if not used[j] and abs(x-b[j]) <= k: used[j] = True; c += 1; break
    return f"{c}\n"
def B_ordered(inp):                                          # Coin Combinations I (cuenta ordenes): error de lectura
    t = inp.split(); n, x = int(t[0]), int(t[1]); coins = list(map(int, t[2:2+n]))
    if x > 5000: return None
    dp = [0]*(x+1); dp[0] = 1
    for s in range(1, x+1): dp[s] = sum(dp[s-c] for c in coins if c <= s) % MOD
    return f"{dp[x]}\n"
def D_int32(inp):
    n = int(inp.split()[0]); out = [n]
    while n != 1:
        n = n//2 if n % 2 == 0 else 3*n+1
        n = (n + 2**31) % 2**32 - 2**31                      # desbordamiento de int de 32 bits
        out.append(n)
        if len(out) > 5000: break
    return ' '.join(map(str, out)) + "\n"
def E_ffd(inp):
    t = inp.split(); n, x = int(t[0]), int(t[1]); return f"{ffd(list(map(int, t[2:2+n])), x)}\n"
def I_all(inp):
    w = inp.split()[0]; r = re.sub(r'([AEIOU])GAS\1', r'\1', w); return (r if r != w else '-') + "\n"
def H_nomod_small(inp):
    n = int(inp.split()[0])
    if n > 90: return None
    a, b = 0, 1
    for _ in range(n): a, b = b, a+b
    return f"{a}\n"                                          # sin modulo
def J_unaligned(inp):                                        # contar palindromos de largo 3 como si fueran adyacentes (K posiciones iguales s[i]==s[i+1])
    N, K, A = map(int, inp.split())
    if N > 12 or A**N > 300000: return None
    import itertools
    return f"{sum(1 for s in itertools.product(range(A), repeat=N) if sum(1 for i in range(N-1) if s[i]==s[i+1]) == K) % P998}\n"
def C_nonstrict_rooms(inp):                                  # reutiliza habitacion si salida <= llegada (error)
    t = list(map(int, inp.split())); n = t[0]; iv = sorted((t[1+2*i], t[2+2*i]) for i in range(n)); import heapq
    h = []; k = 0
    for a, b in iv:
        if h and h[0] <= a: heapq.heapreplace(h, b)
        else: heapq.heappush(h, b); k += 1
    return k
res = {}
res['A: usa < en vez de <=']       = (count('A', A_strict), len(D['A']))
res['A: voraz en orden de entrada'] = ([t['name'] for t in D['A'] if (lambda r: r is not None and r != t['output'])(A_first_fit(t['input']))], len(D['A']))
res['B: cuenta ordenes (Combinaciones I)'] = ([t['name'] for t in D['B'] if (lambda r: r is not None and r != t['output'])(B_ordered(t['input']))], len(D['B']))
res['D: int de 32 bits'] = (count('D', D_int32), len(D['D']))
res['E: empaquetado voraz FFD'] = (count('E', E_ffd), len(D['E']))
res['I: quita todos los patrones, nunca dice +'] = (count('I', I_all), len(D['I']))
res['H: sin modulo (n<=90)'] = ([t['name'] for t in D['H'] if (lambda r: r is not None and r != t['output'])(H_nomod_small(t['input']))], len(D['H']))
res['J: cuenta s[i]==s[i+1] en vez de s[i]==s[i+2]'] = ([t['name'] for t in D['J'] if (lambda r: r is not None and r != t['output'])(J_unaligned(t['input']))], len(D['J']))
bad = [t['name'] for t in D['C'] if C_nonstrict_rooms(t['input']) != solveC_rooms(t['input'])[0]]
res['C: reutiliza habitacion si salida == llegada'] = (bad, len(D['C']))
for k, (b, n) in res.items(): print(f"{k:50s} detectado por {len(b):2d} casos" + ("   <-- NINGUNO" if not b else ""))
print("\nI: la palabra triple-solapada que depende de la interpretacion se descartaria:", not __import__('build2').i_robust('AGASAGASAGASA'))

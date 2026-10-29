"""Referencia eficiente para G. Devuelve (conteo_multiconjunto, conteo_colapsado) SIN modulo (enteros exactos)."""
from collections import Counter
from math import gcd

def norm_line(P, Q):
    """Recta no vertical ni horizontal por P y Q como (p,q,r): q*y = p*x + r, gcd(p,q)=1, q>0."""
    (x1, y1), (x2, y2) = P, Q
    dx, dy = x2-x1, y2-y1
    if dx == 0 or dy == 0: return None
    g = gcd(abs(dx), abs(dy)); p, q = dy//g, dx//g
    if q < 0: p, q = -p, -q
    return (p, q, q*y1 - p*x1)

def line_count(cnt, D, line, singles):
    """(multi, collapsed) de descomposiciones de la multiconjunto sobre la recta, excluyendo conjuntos de un solo punto."""
    p, q, r = line
    Dset = set(D); succ = {}; pred = {}
    for x in D:
        num = p*x + r
        if num % q == 0:
            y = num // q
            if y in Dset: succ[x] = y; pred[y] = x
    for v in D:
        if v not in succ and v not in pred: return (0, 0)     # valor sin pareja posible
    multi = coll = 1; seen = set()
    for v0 in D:                                               # cadenas
        if v0 in pred: continue
        chain = [v0]
        while chain[-1] in succ: chain.append(succ[chain[-1]])
        c_prev = 0; ok = True
        for idx, v in enumerate(chain):
            c = cnt[v] - c_prev
            if c < 0: ok = False; break
            c_prev = c
        if not ok or c_prev != 0: return (0, 0)                # el ultimo no puede tener sucesor
        seen.update(chain)
    for v in D:                                                # ciclos (solo pendiente 1 o -1)
        if v in seen: continue
        cyc = [v]; u = succ[v]
        while u != v: cyc.append(u); u = succ[u]
        for w in cyc: seen.add(w)
        if len(cyc) == 1:
            if cnt[v] % 2: return (0, 0)
        elif len(cyc) == 2:
            a, b = cyc
            if cnt[a] != cnt[b]: return (0, 0)
            M = cnt[a]; multi *= (M+1); coll *= min(M+1, 3)
        else: raise AssertionError("ciclo largo imposible")
    # restar descomposiciones de un solo punto distinto que esten sobre esta recta
    for (a, b) in singles:
        if succ.get(a) == b: multi -= 1; coll -= 1
    return (multi, coll)

def candidate_lines(cnt, D, h):
    lines = set()
    s, t = D[0], D[-1]
    Ps = [(s, u) for u in D] + [(u, s) for u in D]
    Qs = [(t, w) for w in D] + [(w, t) for w in D]
    for P in Ps:
        for Q in Qs:
            if P != Q:
                L = norm_line(P, Q)
                if L: lines.add(L)
    if s != t and cnt[s] == cnt[t]:                            # un unico punto distinto contiene a s y a t
        c = cnt[s]; rem = cnt.copy(); rem[s] -= c; rem[t] -= c
        rest = sorted(v for v in rem if rem[v] > 0)
        if rest:
            s2 = rest[0]
            for R in [(s, t), (t, s)]:
                for u in D:
                    for R2 in [(s2, u), (u, s2)]:
                        L = norm_line(R, R2)
                        if L: lines.add(L)
    return lines

def exhaustive_lines(D):
    """Todas las rectas por pares de puntos de D x D (lento; solo para validar)."""
    pts = [(x, y) for x in D for y in D]; lines = set()
    for i in range(len(pts)):
        for j in range(i+1, len(pts)):
            L = norm_line(pts[i], pts[j])
            if L: lines.add(L)
    return lines

def solve_g(vals, exhaustive=False):
    N = len(vals); h = N//2; cnt = Counter(vals); D = sorted(cnt)
    if len(D) == 1: singles = [(D[0], D[0])]
    elif len(D) == 2 and cnt[D[0]] == h and cnt[D[1]] == h: singles = [(D[0], D[1]), (D[1], D[0])]
    else: singles = []
    multi = coll = len(singles)
    for c in D:                                                # rectas verticales x=c y horizontales y=c
        if cnt[c] >= h:
            rem = cnt.copy(); rem[c] -= h
            if sum(1 for v in rem if rem[v] > 0) >= 2: multi += 2; coll += 2
    for L in (exhaustive_lines(D) if exhaustive else candidate_lines(cnt, D, h)):
        m, c = line_count(cnt, D, L, singles); multi += m; coll += c
    return multi, coll

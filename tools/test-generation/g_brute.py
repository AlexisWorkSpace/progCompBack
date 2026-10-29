import sys
from collections import Counter
from itertools import combinations

def collinear_all(points):
    pts = sorted(set(points))
    if len(pts) <= 2: return True
    (x0,y0),(x1,y1) = pts[0], pts[1]
    for (x,y) in pts[2:]:
        if (x1-x0)*(y-y0) != (y1-y0)*(x-x0): return False
    return True

def brute(vals, multiset_points=True):
    """Enumera todos los conjuntos (multiconjuntos) de N/2 puntos (x,y) cuyos valores son exactamente vals."""
    vals = sorted(vals)
    res = set()
    def rec(rem, pts):
        if not rem:
            key = tuple(sorted(pts)) if multiset_points else tuple(sorted(set(pts)))
            if collinear_all(pts): res.add(key)
            return
        v = rem[0]; rest = rem[1:]
        seen = set()
        for i, w in enumerate(rest):
            if w in seen: continue
            seen.add(w)
            r2 = rest[:i] + rest[i+1:]
            rec(r2, pts + [(v, w)])
            if v != w:
                rec(r2, pts + [(w, v)])
    rec(vals, [])
    return len(res)

if __name__ == '__main__':
    for s in ["1 2 3 5 20 18 16 12", "1 2 5 5 5 5 8 9"]:
        v = list(map(int, s.split()))
        print(s, '-> multiconjunto de puntos:', brute(v, True), '| conjunto sin repetidos:', brute(v, False))

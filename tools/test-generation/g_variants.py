from g_brute import *
def brute_variants(vals):
    vals = sorted(vals)
    multi=set(); collapsed=set(); distinct_only=set()
    def rec(rem, pts):
        if not rem:
            if collinear_all(pts):
                multi.add(tuple(sorted(pts)))
                collapsed.add(tuple(sorted(set(pts))))
                if len(set(pts))==len(pts): distinct_only.add(tuple(sorted(pts)))
            return
        v=rem[0]; rest=rem[1:]; seen=set()
        for i,w in enumerate(rest):
            if w in seen: continue
            seen.add(w); r2=rest[:i]+rest[i+1:]
            rec(r2, pts+[(v,w)])
            if v!=w: rec(r2, pts+[(w,v)])
    rec(vals,[])
    return len(multi), len(collapsed), len(distinct_only)
if __name__ == "__main__":
  for s in ["1 2 3 5 20 18 16 12","1 2 5 5 5 5 8 9","1 1 1 2 2 2","1 1 2 2","3 3 3 3"]:
    v=list(map(int,s.split()))
    print(f"{s:28s} multiconjunto={brute_variants(v)[0]} colapsado={brute_variants(v)[1]} solo_distintos={brute_variants(v)[2]}")

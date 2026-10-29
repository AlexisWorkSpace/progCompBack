import random, sys
from g_brute import brute
from g_ref import solve_g
from g_variants import brute_variants
random.seed(12345)
bad = 0; total = 0; differ = 0
# 1) fuerza bruta (N<=12), rangos pequenos para forzar repetidos, y estructurados
for it in range(1500):
    N = random.choice([4,4,6,6,8,8,10,12])
    R = random.choice([2,3,4,6,10,30])
    lo = random.choice([0,-R//2,-R])
    vals = [random.randint(lo, lo+R) for _ in range(N)]
    if it % 5 == 0:                                            # derivado de puntos realmente colineales
        m = random.choice([1,-1,2,-2,3,-3]); k = random.randint(-6,6); xs = [random.randint(-5,5) for _ in range(N//2)]
        vals = xs + [m*x+k for x in xs]; random.shuffle(vals)
    b_multi, b_coll, _ = brute_variants(vals)
    r_multi, r_coll = solve_g(vals)
    total += 1
    if (b_multi, b_coll) != (r_multi, r_coll):
        bad += 1; print("DIFERENCIA", sorted(vals), "brute", (b_multi,b_coll), "ref", (r_multi,r_coll))
    if b_multi != b_coll: differ += 1
print(f"fuerza bruta: {total} casos, {bad} diferencias; casos donde multiconjunto!=colapsado: {differ}")
# 2) recta exhaustiva vs enumeracion por candidatas (N hasta 30)
bad2 = 0
for it in range(600):
    N = random.choice([8,10,12,14,16,20,24,30])
    R = random.choice([4,6,8,12,20])
    vals = [random.randint(-R//2, R//2) for _ in range(N)]
    if it % 3 == 0:
        m = random.choice([1,-1,2,-2,3,-3,0]); k = random.randint(-6,6); xs = [random.randint(-6,6) for _ in range(N//2)]
        vals = xs + [m*x+k for x in xs]; random.shuffle(vals)
    if solve_g(vals) != solve_g(vals, exhaustive=True):
        bad2 += 1; print("DIFERENCIA exhaustiva", sorted(vals))
print(f"exhaustiva vs candidatas: 600 casos, {bad2} diferencias")
print("ejemplos:", solve_g([1,2,3,5,20,18,16,12]), solve_g([1,2,5,5,5,5,8,9]))

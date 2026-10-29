import json, subprocess, sys, time
from refs import *
from g_ref import solve_g
import build1, build2

def run_bin(b, inp): return subprocess.run([b], input=inp, capture_output=True, text=True, check=True).stdout
def tests_for(ex):
    if ex in 'ABCDE': return getattr(build1, f'build_{ex}')()
    r = getattr(build2, f'build_{ex}')()
    return r[0] if isinstance(r, tuple) else r

def compute(ex, inp):
    if ex == 'A': return solveA(inp)
    if ex == 'B': return run_bin('./b_ref', inp)
    if ex == 'D': return solveD(inp)
    if ex == 'E': return run_bin('./e_ref', inp)
    if ex == 'F': return solveF(inp)
    if ex == 'G': return f"{solve_g(list(map(int, inp.split()[1:])))[0] % MOD}\n"
    if ex == 'H': return solveH(inp)
    if ex == 'I': return solveI(inp)
    if ex == 'J': return solveJ(inp)
    if ex == 'T': return solveT(inp)
    return None                                           # C: lo valida el comprobador, no hay salida unica

def js(v): return json.dumps(v, ensure_ascii=True)
out_lines = ["'use strict';",
  "// ARCHIVO GENERADO por tools/build_all.py a partir de soluciones de referencia verificadas con fuerza bruta.",
  "// No editar a mano: para cambiar casos, regenerar. Entradas grandes: se arman con testGenerators.js (gen + params).",
  "module.exports = {"]
stats = {}; cinfo = []
t0 = time.time()
for ex in 'ABCDEFGHIJT':
    tests = tests_for(ex); out_lines.append(f"  {ex}: [")
    for t in tests:
        inp = t['input'] if t['input'] is not None else build1.node_input(t['gen'], t['params'])
        out = compute(ex, inp)
        if ex == 'C':
            k, room = solveC_rooms(inp); n = int(inp.split()[0]); d = len(str(k))
            assert n * (d + 1) + d + 2 <= 1_040_000, (t['name'], n, k)      # una salida valida nunca supera el limite de 1 MB del juez
            cinfo.append((t['name'], n, k))
        parts = [f"name: {js(t['name'])}"]
        if t['gen']: parts += [f"gen: {js(t['gen'])}", f"params: {js(t['params'])}"]
        else: parts.append(f"input: {js(inp)}")
        if out is not None: parts.append(f"output: {js(out)}")
        out_lines.append("    { " + ", ".join(parts) + " },")
    out_lines.append("  ],"); stats[ex] = len(tests)
    print(f"{ex}: {len(tests)} casos ({time.time()-t0:.0f}s)", flush=True)
out_lines.append("};")
open('../../exerciseTests.js', 'w').write("\n".join(out_lines) + "\n")
print(stats)
assert all(stats[e] >= 32 for e in 'ABCDEFGHIJ'), stats
print("C (nombre, n, habitaciones minimas):"); [print("  ", c) for c in cinfo if c[1] >= 50000]

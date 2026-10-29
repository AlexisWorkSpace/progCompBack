# Generación y verificación de los casos de prueba

Los casos (`exerciseTests.js`) NO se escriben a mano: se generan con soluciones de referencia que se validan contra
fuerza bruta. Requisitos: Python 3.10+, Node 22+, g++.

    cd tools/test-generation
    g++ -O2 -o b_ref b.cpp && g++ -O2 -o e_ref e.cpp      # referencias rapidas de B y E
    python3 build_all.py                                    # regenera ../../exerciseTests.js (~1 min)

Para cambiar o agregar casos: editar `build1.py` (A-E) o `build2.py` (F-J y T) y volver a ejecutar `build_all.py`.
Las entradas muy grandes de A y C se arman al vuelo con `../../testGenerators.js`.

## Verificaciones incluidas
- `python3 g_check.py`       G: 1500 casos contra fuerza bruta + 600 contra enumeracion exhaustiva de rectas.
- `python3 check_others.py`  A, B, E, F, J, H, D contra fuerza bruta independiente.
- `node dump_tests.js && python3 mutants.py`   comprueba que los casos detectan soluciones incorrectas tipicas.
- `node --test` (en la raiz del backend)   restricciones de cada enunciado + segunda implementacion en JavaScript.

## Decisiones de interpretacion (enunciados resumidos)
- G: puntos = pares ordenados (x, y) de la lista, todos colineales; se cuentan conjuntos distintos. Se conservan solo
  entradas donde contar los puntos repetidos como multiconjunto o como conjunto da el mismo resultado.
- I: la transformacion reemplaza una vocal v por vGASv. Se conservan solo palabras cuyo resultado no cambia si se
  permite transformar varias vocales a la vez.
- F: "cada caja mas pesada pesa al menos el doble que una mas ligera" se toma como garantia de la entrada.

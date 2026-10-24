import os
import sys

source_path = '/workspace/source.py'

if not os.path.exists(source_path):
    print(f'Archivo no encontrado: {source_path}', file=sys.stderr)
    sys.exit(1)

try:
    with open(source_path, 'r', encoding='utf-8') as f:
        source = f.read()
    namespace = {'__name__': '__main__'}
    exec(compile(source, source_path, 'exec'), namespace, namespace)
except Exception as exc:
    print(f'{type(exc).__name__}: {exc}', file=sys.stderr)
    sys.exit(1)

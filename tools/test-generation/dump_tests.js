// Vuelca todos los casos (con las entradas grandes ya generadas) a tests_dump.json para mutants.py
const { EXERCISES } = require('../../exercises');
const out = {};
for (const e of EXERCISES) out[e.id] = e.tests.map((t) => ({ name: t.name, input: t.input, output: t.output }));
require('fs').writeFileSync(`${__dirname}/tests_dump.json`, JSON.stringify(out));

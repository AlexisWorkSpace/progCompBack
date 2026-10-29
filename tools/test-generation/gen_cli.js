const { generate } = require('../../testGenerators');
const spec = JSON.parse(process.argv[2]);
process.stdout.write(generate(spec.gen, spec.params));

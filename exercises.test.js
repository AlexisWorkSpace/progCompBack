const test = require('node:test');
const assert = require('node:assert/strict');
const { EXERCISES, validateOutput } = require('./exercises');
const { calculatePenalty } = require('./userStore');

test('the judge has cases for all ten exercises', () => {
  assert.equal(EXERCISES.length, 10);
  for (const exercise of EXERCISES) assert.ok(exercise.tests.length >= 3, `exercise ${exercise.id}`);
});

test('exact-output exercises compare tokens and ignore whitespace', () => {
  const exercise = EXERCISES.find(({ id }) => id === 'A');
  assert.equal(validateOutput(exercise, exercise.tests[0], ' 2\n'), true);
  assert.equal(validateOutput(exercise, exercise.tests[0], '3\n'), false);
});

test('room checker accepts any valid minimum assignment', () => {
  const exercise = EXERCISES.find(({ id }) => id === 'C');
  assert.equal(validateOutput(exercise, exercise.tests[0], '2\n2 1 2\n'), true);
  assert.equal(validateOutput(exercise, exercise.tests[0], '1\n1 1 1\n'), false);
  assert.equal(validateOutput(exercise, exercise.tests[0], '3\n1 2 3\n'), false);
});

test('room checker enforces strict departure-before-arrival', () => {
  const exercise = EXERCISES.find(({ id }) => id === 'C');
  assert.equal(validateOutput(exercise, exercise.tests[0], '2\n1 1 2\n'), false);
});

test('penalty increases once per three wrong submissions and caps at nine', () => {
  assert.equal(calculatePenalty(0), 0);
  assert.equal(calculatePenalty(2), 0);
  assert.equal(calculatePenalty(3), 1);
  assert.equal(calculatePenalty(6), 2);
  assert.equal(calculatePenalty(27), 9);
  assert.equal(calculatePenalty(100), 9);
});

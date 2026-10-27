const test = require('node:test');
const assert = require('node:assert/strict');
const { createSubmissionQueue } = require('./submissionQueue');

function createHarness({ capacity = 2, maxQueued = 200, evaluate } = {}) {
  let active = 0;
  let peak = 0;
  const queue = createSubmissionQueue({
    maxQueued,
    resultTtlMs: 60_000,
    evaluate,
    acquire() {
      if (active >= capacity) return false;
      active += 1;
      peak = Math.max(peak, active);
      return true;
    },
    release() { active -= 1; },
  });
  return { queue, getPeak: () => peak, getActive: () => active };
}

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('nunca supera la capacidad y procesa en orden de llegada', async () => {
  const gates = [];
  const started = [];
  const { queue, getPeak } = createHarness({
    capacity: 2,
    evaluate: (payload) => {
      started.push(payload.n);
      const gate = deferred();
      gates.push(gate);
      return gate.promise.then(() => ({ verdict: 'AC', n: payload.n }));
    },
  });

  const jobs = [1, 2, 3, 4].map((n) => queue.enqueue({ userId: `u${n}`, exerciseId: 'A', payload: { n } }));
  assert.deepEqual(jobs.map((job) => job.status), ['running', 'running', 'queued', 'queued']);
  assert.deepEqual(jobs.map((job) => job.queuePosition), [0, 0, 1, 2]);
  assert.deepEqual(started, [1, 2]);

  gates[0].resolve();
  await tick();
  assert.deepEqual(started, [1, 2, 3]);
  assert.equal(queue.get(jobs[0].jobId, 'u1').status, 'completed');
  assert.equal(queue.get(jobs[3].jobId, 'u4').queuePosition, 1);

  gates[1].resolve();
  await tick();
  gates[2].resolve();
  await tick();
  gates[3].resolve();
  await tick();
  assert.deepEqual(started, [1, 2, 3, 4]);
  assert.equal(getPeak(), 2);
  assert.equal(queue.get(jobs[3].jobId, 'u4').result.n, 4);
});

test('una sola entrega activa por usuario y ejercicio', () => {
  const { queue } = createHarness({ capacity: 1, evaluate: () => new Promise(() => {}) });
  const first = queue.enqueue({ userId: 'u1', exerciseId: 'A', payload: {} });
  const duplicate = queue.enqueue({ userId: 'u1', exerciseId: 'A', payload: {} });
  const other = queue.enqueue({ userId: 'u1', exerciseId: 'B', payload: {} });
  assert.equal(duplicate.jobId, first.jobId);
  assert.notEqual(other.jobId, first.jobId);
});

test('rechaza con 429 cuando la cola está llena', () => {
  const { queue } = createHarness({ capacity: 1, maxQueued: 1, evaluate: () => new Promise(() => {}) });
  queue.enqueue({ userId: 'u1', exerciseId: 'A', payload: {} });
  queue.enqueue({ userId: 'u2', exerciseId: 'A', payload: {} });
  assert.throws(() => queue.enqueue({ userId: 'u3', exerciseId: 'A', payload: {} }), { status: 429 });
});

test('un fallo marca el trabajo como failed y libera la capacidad', async () => {
  const { queue, getActive } = createHarness({
    capacity: 1,
    evaluate: async () => { throw new Error('boom'); },
  });
  const job = queue.enqueue({ userId: 'u1', exerciseId: 'A', payload: {} });
  await tick();
  const view = queue.get(job.jobId, 'u1');
  assert.equal(view.status, 'failed');
  assert.equal(view.result.error, 'boom');
  assert.equal(getActive(), 0);
});

test('solo el propietario puede consultar el trabajo', () => {
  const { queue } = createHarness({ evaluate: () => new Promise(() => {}) });
  const job = queue.enqueue({ userId: 'u1', exerciseId: 'A', payload: {} });
  assert.equal(queue.get(job.jobId, 'u2'), null);
});

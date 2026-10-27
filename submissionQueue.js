const { randomUUID } = require('crypto');

const DEFAULT_MAX_QUEUED = 200;
const DEFAULT_RESULT_TTL_MS = 10 * 60 * 1000;

/**
 * Cola FIFO en memoria para evaluar entregas sin saturar el servidor.
 *
 * - Respeta un límite de ejecuciones simultáneas (`getCapacity`), que se comparte
 *   con otros consumidores de la misma capacidad (por ejemplo, /run) mediante
 *   `acquire`/`release`.
 * - Una entrega activa (en cola o ejecutándose) por usuario y ejercicio.
 * - Rechaza nuevas entregas cuando la cola alcanza `maxQueued`.
 */
function createSubmissionQueue({ evaluate, acquire, release, maxQueued = DEFAULT_MAX_QUEUED, resultTtlMs = DEFAULT_RESULT_TTL_MS }) {
  const pending = [];
  const jobs = new Map();
  let draining = false;

  function publicView(job) {
    const view = {
      jobId: job.id,
      status: job.status,
      queuePosition: job.status === 'queued' ? pending.indexOf(job) + 1 : 0,
    };
    if (job.result) view.result = job.result;
    return view;
  }

  function findActive(userId, exerciseId) {
    for (const job of jobs.values()) {
      if (job.userId === userId && job.exerciseId === exerciseId
        && (job.status === 'queued' || job.status === 'running')) return job;
    }
    return null;
  }

  function scheduleCleanup(job) {
    const timer = setTimeout(() => jobs.delete(job.id), resultTtlMs);
    timer.unref?.();
  }

  async function run(job) {
    job.status = 'running';
    try {
      job.result = await evaluate(job.payload);
      job.status = 'completed';
    } catch (error) {
      job.result = { error: error.message || 'Error al evaluar la solución.' };
      job.status = 'failed';
    } finally {
      job.payload = null;
      scheduleCleanup(job);
    }
  }

  function drain() {
    if (draining) return;
    draining = true;
    try {
      while (pending.length > 0 && acquire()) {
        const job = pending.shift();
        run(job).finally(() => {
          release();
          drain();
        });
      }
    } finally {
      draining = false;
    }
  }

  return {
    /** Encola una entrega. Devuelve la vista pública del trabajo o lanza error con `status`. */
    enqueue({ userId, exerciseId, payload }) {
      const existing = findActive(userId, exerciseId);
      if (existing) return publicView(existing);
      if (pending.length >= maxQueued) {
        throw Object.assign(new Error('La cola de evaluación está llena; vuelve a intentar en unos segundos.'), { status: 429 });
      }
      const job = { id: randomUUID(), userId, exerciseId, payload, status: 'queued', result: null };
      jobs.set(job.id, job);
      pending.push(job);
      drain();
      return publicView(job);
    },
    /** Estado de un trabajo, visible solo para su propietario. */
    get(jobId, userId) {
      const job = jobs.get(jobId);
      return job && job.userId === userId ? publicView(job) : null;
    },
    /** Reanuda el procesamiento cuando se libera capacidad externa. */
    drain,
    stats() {
      return { queued: pending.length, tracked: jobs.size };
    },
  };
}

module.exports = { createSubmissionQueue };

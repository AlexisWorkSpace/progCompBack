const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { EXERCISES, validateOutput } = require('./exercises');

const execFileAsync = promisify(execFile);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.MAX_CONCURRENT_RUNS || 3)));
const MAX_CODE_SIZE = 512 * 1024;
const MAX_INPUT_SIZE = 64 * 1024;
const MAX_OUTPUT_SIZE = 1024 * 1024;
const WORKER_ID = process.env.WORKER_ID || os.hostname();
const PROJECT_ROOT = require('fs').existsSync(path.join(__dirname, 'docker')) ? __dirname : path.join(__dirname, '..');
const LANGUAGE_CONFIG = {
  python: { extension: 'py', image: 'code-runner-python:v3', file: '/workspace/source.py', buildContext: path.join(PROJECT_ROOT, 'docker', 'python') },
  java: { extension: 'java', fileName: 'Main.java', image: 'code-runner-java:v3', file: '/workspace/Main.java', buildContext: path.join(PROJECT_ROOT, 'docker', 'java') },
  c: { extension: 'c', image: 'code-runner-c:v3', file: '/workspace/source.c', buildContext: path.join(PROJECT_ROOT, 'docker', 'c') },
  cpp: { extension: 'cpp', image: 'code-runner-cpp:v3', file: '/workspace/source.cpp', buildContext: path.join(PROJECT_ROOT, 'docker', 'cpp') },
};

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY antes de iniciar judgeWorker.js.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let active = 0;
let stopping = false;
let pollTimer;

async function ensureImage(language) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) throw new Error('Lenguaje no soportado.');
  try {
    await execFileAsync('docker', ['image', 'inspect', config.image], { timeout: 8000 });
  } catch {
    console.log(`Construyendo imagen ${config.image}...`);
    await execFileAsync('docker', ['build', '-t', config.image, config.buildContext], {
      timeout: 600000,
      maxBuffer: 8 * 1024 * 1024,
    });
  }
}

async function createSource(language, sourceCode) {
  const config = LANGUAGE_CONFIG[language];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tecla-ton-judge-'));
  await fs.chmod(dir, 0o755);
  const sourcePath = path.join(dir, config.fileName || `source.${config.extension}`);
  await fs.writeFile(sourcePath, sourceCode, 'utf8');
  await fs.chmod(sourcePath, 0o644);
  return { dir, sourcePath };
}

function runDocker(args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let outputLimitReached = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const append = (current, chunk) => {
      const remaining = MAX_OUTPUT_SIZE - Buffer.byteLength(current);
      if (remaining <= 0) {
        outputLimitReached = true;
        child.kill('SIGKILL');
        return current;
      }
      const buffer = Buffer.from(chunk);
      if (buffer.length > remaining) {
        outputLimitReached = true;
        child.kill('SIGKILL');
        return current + buffer.subarray(0, remaining).toString('utf8');
      }
      return current + buffer.toString('utf8');
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut, outputLimitReached });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function runContainer(language, sourcePath, input, exercise = {}) {
  const config = LANGUAGE_CONFIG[language];
  const containerName = `teclaton-${randomUUID()}`;
  const memoryMb = Math.max(256, Math.min(1024, Number(exercise.memoryLimitMb || 512)));
  const timeLimitMs = Math.max(1000, Math.min(3000, Number(exercise.timeLimitMs || 1000)));
  const args = [
    'run', '--rm', '--name', containerName, '-i',
    '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--read-only', '--pids-limit', '32', '--memory', `${memoryMb}m`, '--memory-swap', `${memoryMb}m`,
    '--cpus', '1', '--user', '65534:65534',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777',
    '-e', `CODE_RUNNER_TIME_LIMIT_SECONDS=${Math.ceil(timeLimitMs / 1000)}`,
    '-v', `${path.dirname(sourcePath)}:/workspace:ro`,
    config.image, config.file,
  ];
  try {
    return await runDocker(args, input, timeLimitMs + 12000);
  } finally {
    await execFileAsync('docker', ['rm', '--force', containerName], { timeout: 5000 }).catch(() => {});
  }
}

async function evaluate(job) {
  if (!LANGUAGE_CONFIG[job.language]) throw new Error('Lenguaje no soportado.');
  if (typeof job.source_code !== 'string' || Buffer.byteLength(job.source_code) > MAX_CODE_SIZE) throw new Error('Código inválido o demasiado grande.');
  const source = await createSource(job.language, job.source_code);
  try {
    if (job.mode === 'run') {
      if (typeof job.stdin !== 'string' || Buffer.byteLength(job.stdin) > MAX_INPUT_SIZE) throw new Error('Entrada inválida o demasiado grande.');
      const started = performance.now();
      const result = await runContainer(job.language, source.sourcePath, job.stdin);
      return {
        success: result.exitCode === 0 && !result.timedOut && !result.outputLimitReached,
        executionTimeMs: Number((performance.now() - started).toFixed(2)),
        programSizeBytes: Buffer.byteLength(job.source_code),
        ...result,
      };
    }

    const exercise = EXERCISES.find((entry) => entry.id === job.exercise_id);
    if (!exercise) throw new Error('Ejercicio no encontrado.');
    const started = performance.now();
    let passedTests = 0;
    let verdict = 'AC';
    let failedTest = null;
    for (let index = 0; index < exercise.tests.length; index += 1) {
      const result = await runContainer(job.language, source.sourcePath, exercise.tests[index].input, exercise);
      if (result.outputLimitReached) {
        verdict = 'OLE'; failedTest = index + 1; break;
      }
      if (result.timedOut || result.exitCode === 124) {
        verdict = 'TLE'; failedTest = index + 1; break;
      }
      if (result.exitCode === 137) {
        verdict = 'MLE'; failedTest = index + 1; break;
      }
      if (result.exitCode !== 0 || !validateOutput(exercise, exercise.tests[index], result.stdout)) {
        verdict = result.exitCode !== 0 && result.stderr ? 'CE/RE' : 'WA';
        failedTest = index + 1;
        break;
      }
      passedTests += 1;
    }
    return {
      verdict,
      passedTests,
      totalTests: exercise.tests.length,
      failedTest,
      executionTimeMs: Number((performance.now() - started).toFixed(2)),
    };
  } finally {
    await fs.rm(source.dir, { recursive: true, force: true });
  }
}

async function claimAndProcess() {
  if (stopping || active >= CONCURRENCY) return;
  active += 1;
  try {
    const { data: jobs, error } = await supabase.rpc('claim_next_judge_job', { p_worker_id: WORKER_ID });
    if (error) throw error;
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    if (!job) return;
    console.log(`Trabajo ${job.id} (${job.mode}, ${job.language})`);
    try {
      const result = await evaluate(job);
      const { error: finishError } = await supabase.rpc('finish_judge_job', {
        p_job_id: job.id, p_worker_id: WORKER_ID, p_result: result, p_failure: null,
      });
      if (finishError) throw finishError;
      console.log(`Trabajo ${job.id} finalizado: ${result.verdict || (result.success ? 'RUN OK' : 'RUN ERROR')}`);
    } catch (error) {
      console.error(`Falló trabajo ${job.id}:`, error.message);
      const { error: finishError } = await supabase.rpc('finish_judge_job', {
        p_job_id: job.id, p_worker_id: WORKER_ID, p_result: null, p_failure: 'No se pudo evaluar la solución. Intenta nuevamente.',
      });
      if (finishError) console.error('No se pudo cerrar el trabajo:', finishError.message);
    }
  } catch (error) {
    console.error('Error consultando la cola:', error.message);
  } finally {
    active -= 1;
  }
}

async function heartbeat() {
  const { error } = await supabase.rpc('heartbeat_judge_worker', {
    p_worker_id: WORKER_ID,
    p_concurrency: CONCURRENCY,
    p_active_jobs: active,
  });
  if (error) console.error('No se pudo actualizar el heartbeat:', error.message);
}

async function recoverStaleJobs() {
  const { error } = await supabase.rpc('requeue_stale_judge_jobs', {
    p_stale_before: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  });
  if (error) console.error('No se pudieron recuperar trabajos atrasados:', error.message);
}

async function pruneOldJobs() {
  const { error } = await supabase.rpc('prune_old_judge_jobs');
  if (error) console.error('No se pudieron limpiar resultados expirados:', error.message);
}

async function main() {
  console.log(`Worker ${WORKER_ID}; concurrencia=${CONCURRENCY}`);
  for (const language of Object.keys(LANGUAGE_CONFIG)) await ensureImage(language);
  await recoverStaleJobs();
  await pruneOldJobs();
  await heartbeat();
  setInterval(() => { void heartbeat(); }, 15000).unref?.();
  setInterval(() => { void recoverStaleJobs(); }, 60000).unref?.();
  setInterval(() => { void pruneOldJobs(); }, 24 * 60 * 60 * 1000).unref?.();
  pollTimer = setInterval(() => { void claimAndProcess(); }, 500);
  void claimAndProcess();
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(pollTimer);
  console.log('Worker deteniéndose; los trabajos activos finalizarán o se reencolarán al reiniciar.');
  const wait = setInterval(() => {
    if (active === 0) {
      clearInterval(wait);
      process.exit(0);
    }
  }, 250);
  wait.unref?.();
  setTimeout(() => process.exit(1), 15000).unref?.();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
main().catch((error) => {
  console.error('No se pudo iniciar el juez local:', error);
  process.exit(1);
});

const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { randomUUID } = require('crypto');
const { performance } = require('perf_hooks');
const { EXERCISES, validateOutput } = require('./exercises');
const userStore = require('./userStore');
const { createSubmissionQueue } = require('./submissionQueue');

const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 8080;
const PROJECT_ROOT = require('fs').existsSync(path.join(__dirname, 'docker')) ? __dirname : path.join(__dirname, '..');
const MAX_CODE_SIZE = 512 * 1024;
const MAX_INPUT_SIZE = 64 * 1024;
const MAX_OUTPUT_SIZE = 1024 * 1024;
const EXECUTION_TIMEOUT_MS = 10000;
const MAX_CONCURRENT_RUNS = Math.max(1, Math.min(8, Number(process.env.MAX_CONCURRENT_RUNS || 4)));
const MAX_QUEUED_SUBMISSIONS = Math.max(1, Number(process.env.MAX_QUEUED_SUBMISSIONS || 200));
let activeRuns = 0;

const rateLimitBuckets = new Map();
const RATE_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  register: { windowMs: 60 * 60 * 1000, max: 5 },
  run: { windowMs: 60 * 1000, max: 10 },
  submit: { windowMs: 60 * 1000, max: 12 },
};

app.disable('x-powered-by');
if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });
  if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : [];
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));
app.use(express.json({ limit: '600kb', strict: true, type: 'application/json' }));

function rateLimit(name, getKey = (req) => req.ip) {
  const config = RATE_LIMITS[name];
  return (req, res, next) => {
    const key = `${name}:${getKey(req) || 'unknown'}`;
    const now = Date.now();
    let bucket = rateLimitBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + config.windowMs };
    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);
    if (rateLimitBuckets.size > 50000) {
      const oldestKey = rateLimitBuckets.keys().next().value;
      if (oldestKey !== undefined) rateLimitBuckets.delete(oldestKey);
    }
    res.set('RateLimit-Limit', String(config.max));
    res.set('RateLimit-Remaining', String(Math.max(0, config.max - bucket.count)));
    res.set('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > config.max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Demasiadas solicitudes. Espera antes de volver a intentarlo.' });
    }
    return next();
  };
}

const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (now >= bucket.resetAt) rateLimitBuckets.delete(key);
  }
}, 60_000);
rateLimitCleanup.unref();

function requireUser(req, res, next) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  req.authenticatedUser = user;
  return next();
}

const LANGUAGE_CONFIG = {
  python: {
    extension: 'py',
    image: 'code-runner-python:v3',
    containerPath: '/workspace/source.py',
    buildContext: path.join(PROJECT_ROOT, 'docker', 'python'),
  },
  java: {
    extension: 'java',
    fileName: 'Main.java',
    image: 'code-runner-java:v3',
    containerPath: '/workspace/Main.java',
    buildContext: path.join(PROJECT_ROOT, 'docker', 'java'),
  },
  c: {
    extension: 'c',
    image: 'code-runner-c:v3',
    containerPath: '/workspace/source.c',
    buildContext: path.join(PROJECT_ROOT, 'docker', 'c'),
  },
  cpp: {
    extension: 'cpp',
    image: 'code-runner-cpp:v3',
    containerPath: '/workspace/source.cpp',
    buildContext: path.join(PROJECT_ROOT, 'docker', 'cpp'),
  },
};

async function ensureDockerImage(language) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  try {
    await execFileAsync('docker', ['image', 'inspect', config.image], { timeout: 8000 });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Docker is not installed or not available in PATH.');
    }

    if (error.killed || error.code === 'ETIMEDOUT') {
      throw new Error('Docker Engine no responde. Reinicia Docker Desktop e inténtalo de nuevo.');
    }

    try {
      await execFileAsync('docker', ['build', '-t', config.image, config.buildContext], {
        timeout: 180000,
        maxBuffer: 1024 * 1024 * 4,
      });
    } catch (buildError) {
      if (buildError.killed || buildError.code === 'ETIMEDOUT') {
        throw new Error('La construcción de la imagen Docker excedió el límite de 3 minutos.');
      }
      throw buildError;
    }
  }
}

async function createTemporarySource(language, code) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-runner-'));
  const config = LANGUAGE_CONFIG[language];
  const extension = config?.extension || 'txt';
  const fileName = config?.fileName || `source.${extension}`;
  const filePath = path.join(tempDir, fileName);

  await fs.chmod(tempDir, 0o755);
  await fs.writeFile(filePath, code, 'utf8');
  await fs.chmod(filePath, 0o644);

  return { tempDir, filePath, fileName };
}

function runDocker(args, { input = '', timeout = EXECUTION_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let outputLimitReached = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    const collect = (current, chunk) => {
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

    child.stdout.on('data', (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = collect(stderr, chunk); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: exitCode ?? 1, timedOut, outputLimitReached });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function runCodeInContainer(language, sourcePath, input, limits = {}) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const containerName = `code-runner-${randomUUID()}`;
  const dockerArgs = [
    'run',
    '--rm',
    '--name', containerName,
    '-i',
    '--network', 'none',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--pids-limit', '64',
    '--memory', '256m',
    '--memory-swap', '256m',
    '--cpus', '1',
    '--user', '65534:65534',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777',
    '-v', `${path.dirname(sourcePath)}:/workspace:ro`,
  ];

  if (limits.memoryLimitMb) {
    const memory = `${limits.memoryLimitMb}m`;
    dockerArgs[dockerArgs.indexOf('--memory') + 1] = memory;
    dockerArgs[dockerArgs.indexOf('--memory-swap') + 1] = memory;
  }
  if (limits.timeLimitMs) dockerArgs.push('-e', `CODE_RUNNER_TIME_LIMIT_SECONDS=${Math.ceil(limits.timeLimitMs / 1000)}`);
  dockerArgs.push(config.image, config.containerPath);

  try {
    return await runDocker(dockerArgs, { input, timeout: limits.timeLimitMs ? limits.timeLimitMs + 10000 : EXECUTION_TIMEOUT_MS });
  } finally {
    await execFileAsync('docker', ['rm', '--force', containerName], { timeout: 5000 }).catch(() => {});
  }
}

function getAuthenticatedUser(req) {
  const authorization = req.get('authorization') || '';
  return userStore.verifyToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
}

app.get('/exercises', async (req, res) => {
  try {
    const text = await fs.readFile(path.join(PROJECT_ROOT, 'ejercicios.txt'), 'utf8');
    const sections = [...text.matchAll(/^Problema ([A-J]) — ([^\r\n]+)/gm)];
    const exercises = EXERCISES.map((exercise) => {
      const index = sections.findIndex((section) => section[1] === exercise.id);
      const start = index >= 0 ? sections[index].index : -1;
      const end = index >= 0 && sections[index + 1] ? sections[index + 1].index : text.length;
      return {
        id: exercise.id,
        title: exercise.title,
        timeLimitMs: exercise.timeLimitMs,
        memoryLimitMb: exercise.memoryLimitMb,
        testCount: exercise.tests.length,
        statement: start >= 0 ? text.slice(start, end).trim() : '',
      };
    });
    res.json({ exercises });
  } catch {
    res.status(500).json({ error: 'No se pudieron cargar los enunciados.' });
  }
});

app.post('/auth/register', rateLimit('register'), async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false') {
    return res.status(403).json({ error: 'El registro de nuevas cuentas está deshabilitado.' });
  }
  try {
    res.status(201).json(await userStore.createAccount(req.body?.username || '', req.body?.password));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear la cuenta.' });
  }
});

app.post('/auth/login', rateLimit('login'), async (req, res) => {
  try {
    res.json(await userStore.login(req.body?.username || '', req.body?.password));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'No se pudo iniciar sesión.' });
  }
});

app.get('/auth/me', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  return res.json({ user });
});

app.get('/ranking', (req, res) => {
  res.json({ users: userStore.getRanking(), exerciseIds: EXERCISES.map(({ id }) => id) });
});

async function evaluateSubmission({ userId, exercise, language, code }) {
  let tempDir;
  try {
    await ensureDockerImage(language);
    const source = await createTemporarySource(language, code);
    tempDir = source.tempDir;
    const startedAt = performance.now();
    let passedTests = 0;
    let verdict = 'AC';
    let failedTest = null;

    for (let index = 0; index < exercise.tests.length; index += 1) {
      const test = exercise.tests[index];
      const result = await runCodeInContainer(language, source.filePath, test.input, exercise);
      const timedOut = result.timedOut || result.exitCode === 124;
      if (timedOut || result.exitCode === 137) {
        verdict = timedOut ? 'TLE' : 'MLE';
        failedTest = index + 1;
        break;
      }
      if (result.exitCode !== 0 || !validateOutput(exercise, test, result.stdout)) {
        verdict = result.exitCode !== 0 && result.stderr ? 'CE/RE' : 'WA';
        failedTest = index + 1;
        break;
      }
      passedTests += 1;
    }

    const scoreResult = await userStore.recordSubmission(userId, exercise.id, verdict === 'AC');
    return {
      verdict: scoreResult.alreadySolved ? 'AC' : verdict,
      passedTests,
      totalTests: exercise.tests.length,
      failedTest,
      executionTimeMs: Number((performance.now() - startedAt).toFixed(2)),
      ...scoreResult,
    };
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Docker no está disponible en este entorno.');
    throw error;
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// Cola de entregas: las evaluaciones se procesan en orden de llegada y nunca
// superan MAX_CONCURRENT_RUNS ejecuciones simultáneas (compartidas con /run).
const submissionQueue = createSubmissionQueue({
  evaluate: evaluateSubmission,
  maxQueued: MAX_QUEUED_SUBMISSIONS,
  acquire() {
    if (activeRuns >= MAX_CONCURRENT_RUNS) return false;
    activeRuns += 1;
    return true;
  },
  release() {
    activeRuns -= 1;
  },
});

app.get('/jobs/:jobId', requireUser, (req, res) => {
  const job = submissionQueue.get(req.params.jobId, req.authenticatedUser.id);
  if (!job) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  return res.json(job);
});

app.post('/submit', requireUser, rateLimit('submit'), rateLimit('submit', (req) => req.authenticatedUser.id), async (req, res) => {
  try {
    const user = req.authenticatedUser;

    const { exerciseId, language, code } = req.body || {};
    const exercise = EXERCISES.find((candidate) => candidate.id === exerciseId);
    const normalizedLanguage = String(language || '').toLowerCase();
    if (!exercise || !LANGUAGE_CONFIG[normalizedLanguage] || typeof code !== 'string') {
      return res.status(400).json({ error: 'Selecciona un ejercicio, lenguaje y código válidos.' });
    }
    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_SIZE) return res.status(413).json({ error: 'El código supera el límite de 512 KB.' });
    if (user.scores[exerciseId] !== undefined) {
      return res.json({ verdict: 'AC', alreadySolved: true, score: user.scores[exerciseId], message: 'Este ejercicio ya está resuelto.' });
        }

    const job = submissionQueue.enqueue({
      userId: user.id,
      exerciseId: exercise.id,
      payload: { userId: user.id, exercise, language: normalizedLanguage, code },
    });
    return res.status(202).json(job);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: error.message || 'Error al evaluar la solución.' });
  }
});

app.post('/run', requireUser, rateLimit('run'), rateLimit('run', (req) => req.authenticatedUser.id), async (req, res) => {
  let acquiredSlot = false;
  try {
    const { language, code, input = '' } = req.body || {};

    if (!language || typeof code !== 'string' || typeof input !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un lenguaje, código e input de texto válidos.',
      });
    }

    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_SIZE || Buffer.byteLength(input, 'utf8') > MAX_INPUT_SIZE) {
      return res.status(413).json({ success: false, error: 'El código supera 512 KB o la entrada supera 64 KB.' });
    }

    const normalizedLanguage = String(language).toLowerCase();

    if (!LANGUAGE_CONFIG[normalizedLanguage]) {
      return res.status(400).json({
        success: false,
        error: 'Lenguaje no soportado. Usa python, java, c o cpp.',
      });
    }

    if (activeRuns >= MAX_CONCURRENT_RUNS) {
      return res.status(429).json({ success: false, error: 'El servidor está ocupado. Inténtalo de nuevo en unos segundos.' });
    }

    activeRuns += 1;
    acquiredSlot = true;
    await ensureDockerImage(normalizedLanguage);

    const { tempDir, filePath } = await createTemporarySource(normalizedLanguage, code);

    try {
      const executionStartedAt = performance.now();
      const result = await runCodeInContainer(normalizedLanguage, filePath, input);
      return res.json({
        success: result.exitCode === 0 && !result.timedOut && !result.outputLimitReached,
        executionTimeMs: Number((performance.now() - executionStartedAt).toFixed(2)),
        programSizeBytes: Buffer.byteLength(code, 'utf8'),
        ...result,
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(500).json({
        success: false,
        error: 'Docker no está disponible en este entorno.',
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Error al ejecutar el código.',
        });
  } finally {
    if (acquiredSlot) {
      activeRuns -= 1;
      submissionQueue.drain();
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'code-runner-backend' });
});

userStore.initializeUserStore().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('No se pudo inicializar el almacenamiento de usuarios:', error);
  process.exitCode = 1;
});

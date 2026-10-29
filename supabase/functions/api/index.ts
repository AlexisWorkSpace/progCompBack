import { createClient } from '@supabase/supabase-js';
import exerciseText from './exercises-text.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const APP_SECRET_KEY = Deno.env.get('APP_SECRET_KEY')!;
const APP_PUBLISHABLE_KEY = Deno.env.get('APP_PUBLISHABLE_KEY')!;
const allowedOrigins = (Deno.env.get('FRONTEND_ORIGIN') || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const admin = createClient(SUPABASE_URL, APP_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const loginClient = createClient(SUPABASE_URL, APP_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const limits = {
  register: { windowMs: 60 * 60 * 1000, max: 5 },
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  run: { windowMs: 60 * 1000, max: 10 },
  submit: { windowMs: 60 * 1000, max: 12 },
};
const buckets = new Map<string, { count: number; resetAt: number }>();
const usernamePattern = /^[A-Za-z0-9_-]{3,20}$/;
const usernameEmail = (username: string) => `${username.toLowerCase()}@users.teclaton.invalid`;
const exerciseMeta = [
  { id: 'A', title: 'Apartamentos Límite', timeLimitMs: 1000, memoryLimitMb: 512, testCount: 1 },
  { id: 'B', title: 'Combinaciones de Monedas II', timeLimitMs: 1000, memoryLimitMb: 512, testCount: 1 },
  { id: 'C', title: 'Asignación de Habitaciones', timeLimitMs: 1000, memoryLimitMb: 512, testCount: 1 },
  { id: 'D', title: 'Algoritmo Extraño', timeLimitMs: 1000, memoryLimitMb: 512, testCount: 1 },
  { id: 'E', title: 'Viajes en Ascensor', timeLimitMs: 1000, memoryLimitMb: 512, testCount: 1 },
  { id: 'F', title: 'Hangar del SBC', timeLimitMs: 1000, memoryLimitMb: 512, testCount: 1 },
  { id: 'G', title: 'Juntando Datos', timeLimitMs: 1000, memoryLimitMb: 512, testCount: 1 },
  { id: 'H', title: 'Números de Fibonacci', timeLimitMs: 1000, memoryLimitMb: 512, testCount: 1 },
  { id: 'I', title: 'Rompiendo Rosarigasino', timeLimitMs: 1000, memoryLimitMb: 1024, testCount: 1 },
  { id: 'J', title: 'Número de cadenas', timeLimitMs: 1000, memoryLimitMb: 1024, testCount: 1 },
];
const problemSections = [...exerciseText.matchAll(/^Problema ([A-JT]) — [^\r\n]+/gm)];

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...Object.fromEntries(new Headers(headers).entries()) },
  });
}

function rateLimit(name: keyof typeof limits, key: string) {
  const config = limits[name];
  const now = Date.now();
  let bucket = buckets.get(`${name}:${key}`);
  if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + config.windowMs };
  bucket.count += 1;
  buckets.set(`${name}:${key}`, bucket);
  if (buckets.size > 10000) {
    for (const [entryKey, entry] of buckets) if (now >= entry.resetAt) buckets.delete(entryKey);
  }
  return bucket.count <= config.max;
}

async function readJson(req: Request) {
  const length = Number(req.headers.get('content-length') || 0);
  if (length > 600 * 1024) throw new Error('La solicitud es demasiado grande.');
  return await req.json();
}

async function getUser(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7);
  if (!token || token.length > 8192) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function profile(userId: string) {
  const { data, error } = await admin.from('profiles')
    .select('user_id, username, full_name, career, team_id, teams(id, name, kind, invite_code, member1_name, member2_expected_name, member2_name)')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: scores, error: scoreError } = await admin
    .from('team_scores').select('exercise_id, score, wrong_attempts').eq('team_id', data.team_id);
  if (scoreError) throw scoreError;
  const result: Record<string, number> = {};
  const wrongAttempts: Record<string, number> = {};
  for (const row of scores || []) {
    wrongAttempts[row.exercise_id] = row.wrong_attempts;
    if (row.score !== null) result[row.exercise_id] = row.score;
  }
  const team = Array.isArray(data.teams) ? data.teams[0] : data.teams;
  return {
    id: userId, username: data.username, fullName: data.full_name, career: data.career,
    teamId: data.team_id, scores: result, wrongAttempts,
    team: team ? {
      id: team.id, name: team.name, kind: team.kind,
      inviteCode: team.kind === 'pair' && !team.member2_name ? team.invite_code : null,
      members: [team.member1_name, team.member2_name || (team.kind === 'pair' ? team.member2_expected_name : null)].filter(Boolean),
      isComplete: team.kind === 'solo' || Boolean(team.member2_name),
    } : null,
  };
}

async function route(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const functionIndex = segments.lastIndexOf('api');
  const routePath = segments.slice(functionIndex + 1).join('/');
  const method = req.method.toUpperCase();

  if (method === 'GET' && routePath === 'health') {
    const { data: workers, error: workerError } = await admin.from('judge_workers')
      .select('concurrency, active_jobs, heartbeat_at').order('heartbeat_at', { ascending: false }).limit(1);
    if (workerError) throw workerError;
    const worker = workers?.[0];
    const isOnline = Boolean(worker && Date.now() - new Date(worker.heartbeat_at).getTime() < 45000);
    const { count, error: queueError } = await admin.from('judge_jobs')
      .select('id', { count: 'exact', head: true }).eq('status', 'queued');
    if (queueError) throw queueError;
    return json({
      ok: true,
      service: 'tecla-ton-supabase-api',
      judge: { online: isOnline, concurrency: isOnline ? worker.concurrency : 0, active: isOnline ? worker.active_jobs : 0, queued: count || 0 },
    });
  }

  if (method === 'GET' && routePath === 'exercises') {
    const exercises = exerciseMeta.map((exercise) => {
      const index = problemSections.findIndex((section) => section[1] === exercise.id);
      const start = index >= 0 ? problemSections[index].index : -1;
      const end = index >= 0 && problemSections[index + 1] ? problemSections[index + 1].index : exerciseText.length;
      return { ...exercise, statement: start >= 0 ? exerciseText.slice(start, end).trim() : '' };
    });
    return json({ exercises });
  }

  if (method === 'GET' && routePath === 'ranking') {
    const { data, error } = await admin.from('teams')
      .select('id, name, kind, member1_name, member2_name, member2_expected_name, team_scores(exercise_id, score)');
    if (error) throw error;
    const users = (data || []).map((entry: any) => {
      const scores: Record<string, number> = {};
      for (const row of entry.team_scores || []) if (row.score !== null) scores[row.exercise_id] = row.score;
      const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
      return {
        id: entry.id, teamName: entry.name, kind: entry.kind,
        username: entry.name,
        members: [entry.member1_name, entry.member2_name || (entry.kind === 'pair' ? entry.member2_expected_name : null)].filter(Boolean),
        scores, total, solved: Object.keys(scores).length,
      };
    }).sort((a: any, b: any) => b.total - a.total || b.solved - a.solved || a.teamName.localeCompare(b.teamName));
    return json({ users, exerciseIds: ['A','B','C','D','E','F','G','H','I','J'] });
  }

  if (method === 'POST' && routePath === 'auth/register') {
    if (!rateLimit('register', req.headers.get('cf-connecting-ip') || 'unknown')) return json({ error: 'Límite de registros alcanzado. Intenta más tarde.' }, 429);
    const body = await readJson(req);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const career = typeof body.career === 'string' ? body.career.trim() : '';
    const password = body.password;
    if (!usernamePattern.test(username)) return json({ error: 'El usuario debe tener entre 3 y 20 caracteres (letras, números, guion o guion bajo).' }, 400);
    if (fullName.length < 2 || fullName.length > 100 || career.length < 2 || career.length > 100) {
      return json({ error: 'Ingresa nombre completo y carrera (2–100 caracteres).' }, 400);
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return json({ error: 'La contraseña debe tener entre 8 y 128 caracteres.' }, 400);
    const teamMode = body.teamMode;
    if (!['solo', 'pair', 'join'].includes(teamMode)) return json({ error: 'Selecciona la modalidad de equipo.' }, 400);
    if (teamMode === 'pair' && (typeof body.teamName !== 'string' || typeof body.teammateName !== 'string')) {
      return json({ error: 'Indica el nombre del equipo y el segundo participante.' }, 400);
    }
    if (teamMode === 'solo' && typeof body.teamName !== 'string') return json({ error: 'Indica el nombre del equipo individual.' }, 400);
    if (teamMode === 'join' && typeof body.inviteCode !== 'string') return json({ error: 'Ingresa el código de invitación.' }, 400);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: usernameEmail(username), password, email_confirm: true,
      user_metadata: {
        username, full_name: fullName, career, team_mode: teamMode,
        team_name: typeof body.teamName === 'string' ? body.teamName.trim() : '',
        teammate_name: typeof body.teammateName === 'string' ? body.teammateName.trim() : '',
        invite_code: typeof body.inviteCode === 'string' ? body.inviteCode.trim().toUpperCase() : '',
      },
    });
    if (createError) {
      const message = createError.message || '';
      return json({ error: message.includes('already') || message.includes('unique') ? 'Ese usuario ya está registrado.' : message.includes('equipo') || message.includes('participante') || message.includes('Código') || message.includes('80') || message.includes('40') ? message : 'No se pudo crear la cuenta.' }, 400);
    }
    const { data: session, error: signInError } = await loginClient.auth.signInWithPassword({ email: usernameEmail(username), password });
    if (signInError || !session.session || !created.user) return json({ error: 'La cuenta fue creada. Inicia sesión para continuar.' }, 503);
    return json({ user: await profile(created.user.id), token: session.session.access_token, refreshToken: session.session.refresh_token }, 201);
  }

  if (method === 'POST' && routePath === 'auth/login') {
    if (!rateLimit('login', req.headers.get('cf-connecting-ip') || 'unknown')) return json({ error: 'Demasiados intentos. Espera antes de volver a intentarlo.' }, 429);
    const body = await readJson(req);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (!usernamePattern.test(username) || typeof body.password !== 'string') return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    const { data, error } = await loginClient.auth.signInWithPassword({ email: usernameEmail(username), password: body.password });
    if (error || !data.session || !data.user) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    return json({ user: await profile(data.user.id), token: data.session.access_token, refreshToken: data.session.refresh_token });
  }

  if (method === 'POST' && routePath === 'auth/refresh') {
    const body = await readJson(req);
    if (typeof body.refreshToken !== 'string') return json({ error: 'La sesión expiró.' }, 401);
    const { data, error } = await loginClient.auth.refreshSession({ refresh_token: body.refreshToken });
    if (error || !data.session || !data.user) return json({ error: 'La sesión expiró. Inicia sesión otra vez.' }, 401);
    return json({ user: await profile(data.user.id), token: data.session.access_token, refreshToken: data.session.refresh_token });
  }

  if (method === 'GET' && routePath === 'auth/me') {
    const user = await getUser(req);
    if (!user) return json({ error: 'Inicia sesión para continuar.' }, 401);
    const current = await profile(user.id);
    return current ? json({ user: current }) : json({ error: 'No existe el perfil.' }, 404);
  }

  if (method === 'POST' && (routePath === 'submit' || routePath === 'run')) {
    const user = await getUser(req);
    if (!user) return json({ error: 'Inicia sesión para continuar.' }, 401);
    if (routePath === 'run' && !rateLimit('run', user.id)) return json({ error: 'Alcanzaste el límite de ejecuciones por minuto.' }, 429);
    const current = await profile(user.id);
    if (!current?.teamId) return json({ error: 'La cuenta no pertenece a un equipo.' }, 403);
    if (routePath === 'submit' && !rateLimit('submit', current.teamId)) return json({ error: 'El equipo alcanzó el límite de envíos por minuto.' }, 429);
    if (routePath === 'submit' && current.team?.kind === 'pair' && !current.team.isComplete) {
      return json({ error: 'El equipo está incompleto; el segundo participante debe crear su cuenta con el código de invitación.' }, 409);
    }
    const body = await readJson(req);
    if (typeof body.code !== 'string' || body.code.length > 512 * 1024) return json({ error: 'Código inválido o supera 512 KB.' }, 413);
    if (!['python', 'java', 'c', 'cpp'].includes(body.language)) return json({ error: 'Lenguaje no soportado.' }, 400);
    const mode = routePath === 'submit' ? 'submit' : 'run';
    if (mode === 'submit' && !exerciseMeta.some((exercise) => exercise.id === body.exerciseId)) {
      return json({ error: 'Ejercicio no válido.' }, 400);
    }
    const { data: queued, error: queueError } = await admin.rpc('enqueue_judge_job', {
      p_user_id: user.id,
      p_team_id: current.teamId,
      p_mode: mode,
      p_exercise_id: mode === 'submit' ? body.exerciseId : null,
      p_language: body.language,
      p_source_code: body.code,
      p_stdin: typeof body.input === 'string' ? body.input : '',
    });
    if (queueError) {
      console.error('Judge enqueue failed:', queueError);
      const fullQueue = queueError.code === '53300';
      return json({ error: fullQueue ? 'La cola está llena; espera y vuelve a intentar.' : 'No se pudo encolar el trabajo.' }, fullQueue ? 429 : 500);
    }
    if (queued?.alreadySolved) return json(queued, 200);
    return json(queued, 202);
  }

  const jobMatch = routePath.match(/^jobs\/([0-9a-f-]{36})$/i);
  if (method === 'GET' && jobMatch) {
    const user = await getUser(req);
    if (!user) return json({ error: 'Inicia sesión para continuar.' }, 401);
    const current = await profile(user.id);
    if (!current?.teamId) return json({ error: 'La cuenta no pertenece a un equipo.' }, 403);
    const { data: job, error } = await admin.from('judge_jobs')
      .select('id, status, result, created_at')
      .eq('id', jobMatch[1]).eq('team_id', current.teamId).maybeSingle();
    if (error) throw error;
    if (!job) return json({ error: 'Trabajo no encontrado.' }, 404);
    let queuePosition = 0;
    if (job.status === 'queued') {
      const { count, error: countError } = await admin.from('judge_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued').lte('created_at', job.created_at);
      if (countError) throw countError;
      queuePosition = count || 1;
    }
    return json({
      jobId: job.id,
      status: job.status,
      queuePosition,
      ...(job.result ? { result: job.result } : {}),
    });
  }

  return json({ error: 'Ruta no encontrada.' }, 404);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  } else if (origin) {
    return json({ error: 'Origen no permitido.' }, 403);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    const response = await route(req);
    for (const [key, value] of headers) response.headers.set(key, value);
    return response;
  } catch (error) {
    console.error('API function error:', error);
    return json({ error: 'Error interno del servicio.' }, 500, headers);
  }
});

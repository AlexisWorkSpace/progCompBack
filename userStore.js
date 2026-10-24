const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const DATA_DIR = process.env.USER_DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'auth-secret');
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
let state = { users: [] };
let tokenSecret;
let writeQueue = Promise.resolve();

function calculatePenalty(wrongAttempts) {
  return Math.min(9, Math.floor(wrongAttempts / 3));
}

async function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const tempPath = `${USERS_FILE}.tmp`;
    await fs.writeFile(tempPath, snapshot, { mode: 0o600 });
    await fs.rename(tempPath, USERS_FILE);
  });
  return writeQueue;
}

async function initializeUserStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    state = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
    if (!Array.isArray(state.users)) state = { users: [] };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await persist();
  }
  try {
    tokenSecret = await fs.readFile(SECRET_FILE);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    tokenSecret = crypto.randomBytes(48);
    await fs.writeFile(SECRET_FILE, tokenSecret, { mode: 0o600, flag: 'wx' }).catch(async (writeError) => {
      if (writeError.code !== 'EEXIST') throw writeError;
      tokenSecret = await fs.readFile(SECRET_FILE);
    });
  }
}

function safeUser(user) {
  return { id: user.id, username: user.username, scores: user.scores || {}, wrongAttempts: user.wrongAttempts || {} };
}

function signToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', tokenSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', tokenSecret).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.userId || payload.exp < Math.floor(Date.now() / 1000)) return null;
    const user = state.users.find((entry) => entry.id === payload.userId);
    return user ? safeUser(user) : null;
  } catch {
    return null;
  }
}

async function createAccount(username, password) {
  if (typeof username !== 'string') {
    throw Object.assign(new Error('El nombre de usuario no es válido.'), { status: 400 });
  }
  const normalized = username.trim();
  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(normalized)) {
    throw Object.assign(new Error('El usuario debe tener entre 3 y 20 letras, números, guiones o guiones bajos.'), { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw Object.assign(new Error('La contraseña debe tener entre 8 y 128 caracteres.'), { status: 400 });
  }
  if (state.users.some((user) => user.username.toLowerCase() === normalized.toLowerCase())) {
    throw Object.assign(new Error('Ese nombre de usuario ya está registrado.'), { status: 409 });
  }
  const salt = crypto.randomBytes(16);
  const passwordHash = await scrypt(password, salt, 64);
  if (state.users.some((entry) => entry.username.toLowerCase() === normalized.toLowerCase())) {
    throw Object.assign(new Error('Ese nombre de usuario ya está registrado.'), { status: 409 });
  }
  const user = {
    id: crypto.randomUUID(), username: normalized, salt: salt.toString('base64'),
    passwordHash: passwordHash.toString('base64'), scores: {}, wrongAttempts: {}, createdAt: new Date().toISOString(),
  };
  state.users.push(user);
  await persist();
  return { user: safeUser(user), token: signToken({ userId: user.id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }) };
}

async function login(username, password) {
  const normalized = String(username || '').trim().toLowerCase();
  const user = state.users.find((entry) => entry.username.toLowerCase() === normalized);
  if (!user || typeof password !== 'string' || password.length > 128) {
    throw Object.assign(new Error('Usuario o contraseña incorrectos.'), { status: 401 });
  }
  const expected = Buffer.from(user.passwordHash, 'base64');
  const actual = await scrypt(password, Buffer.from(user.salt, 'base64'), expected.length);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw Object.assign(new Error('Usuario o contraseña incorrectos.'), { status: 401 });
  }
  return { user: safeUser(user), token: signToken({ userId: user.id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }) };
}

function currentUser(userId) {
  const user = state.users.find((entry) => entry.id === userId);
  return user ? safeUser(user) : null;
}

async function recordSubmission(userId, exerciseId, accepted) {
  const user = state.users.find((entry) => entry.id === userId);
  if (!user) throw Object.assign(new Error('La sesión ya no es válida.'), { status: 401 });
  user.scores ||= {};
  user.wrongAttempts ||= {};
  if (user.scores[exerciseId] !== undefined) {
    return { alreadySolved: true, score: user.scores[exerciseId], wrongAttempts: user.wrongAttempts[exerciseId] || 0, penalty: 0 };
  }
  if (!accepted) {
    user.wrongAttempts[exerciseId] = (user.wrongAttempts[exerciseId] || 0) + 1;
    await persist();
    return { alreadySolved: false, score: 0, wrongAttempts: user.wrongAttempts[exerciseId], penalty: 0 };
  }
  const wrongAttempts = user.wrongAttempts[exerciseId] || 0;
  const penalty = calculatePenalty(wrongAttempts);
  const score = 10 - penalty;
  user.scores[exerciseId] = score;
  await persist();
  return { alreadySolved: false, score, wrongAttempts, penalty };
}

function getRanking() {
  return state.users.map((user) => ({
    id: user.id,
    username: user.username,
    scores: { ...(user.scores || {}) },
    total: Object.values(user.scores || {}).reduce((sum, score) => sum + score, 0),
    solved: Object.keys(user.scores || {}).length,
  })).sort((a, b) => b.total - a.total || b.solved - a.solved || a.username.localeCompare(b.username));
}

module.exports = { initializeUserStore, createAccount, login, verifyToken, currentUser, recordSubmission, getRanking, calculatePenalty };

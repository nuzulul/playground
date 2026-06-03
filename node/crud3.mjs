//refreshtoken

//curl -X POST http://localhost:3000/api/auth/refresh -d "{\"refreshToken\": \"TEKS_REFRESH_TOKEN_ANDA\"}"

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

// --- Konfigurasi JWT ---
const JWT_SECRET = 'rahasia_super_aman_anda_123!';
const ACCESS_TOKEN_EXP = 15 * 60 * 1000;      // 15 Menit
const REFRESH_TOKEN_EXP = 7 * 24 * 60 * 60 * 1000; // 7 Hari

// --- Database Setup ---
const db = new DatabaseSync(':memory:');
// Tambah tabel refresh_tokens untuk pelacakan dan keamanan (Revocation)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// --- Utility: Hash Password ---
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, hash] = storedPassword.split(':');
  const verifyHash = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

// --- Utility: JWT Native ---
function base64UrlEncode(str) { return Buffer.from(str).toString('base64url'); }
function base64UrlDecode(str) { return Buffer.from(str, 'base64url').toString('utf8'); }

function generateJWT(payload, expiresIn) {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  const encodedHeader = base64UrlEncode(header);
  
  const finalPayload = { ...payload, exp: Date.now() + expiresIn };
  const encodedPayload = base64UrlEncode(JSON.stringify(finalPayload));
  
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
    
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJWT(token) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const expectedSignature = createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() > payload.exp) return null;

    return payload;
  } catch (err) {
    return null;
  }
}

// --- Middleware Authentication ---
function authenticate(req, res) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendJSON(res, 401, { error: 'Akses ditolak. Token tidak disediakan.' });
    return null;
  }

  const token = authHeader.split(' ')[1];
  const user = verifyJWT(token);

  if (!user) {
    sendJSON(res, 401, { error: 'Token tidak valid atau telah kedaluwarsa.' });
    return null;
  }
  return user;
}

// --- Helper HTTP ---
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } 
      catch (err) { reject(new Error('Format JSON tidak valid')); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// --- HTTP Server ---
const server = createServer(async (req, res) => {
  const { method, url } = req;
  const userUrlRegex = /^\/api\/users\/(\d+)$/;
  const match = url.match(userUrlRegex);
  const userId = match ? parseInt(match, 10) : null;

  try {
    // 1. POST /api/auth/register
    if (method === 'POST' && url === '/api/auth/register') {
      const { name, email, password } = await getRequestBody(req);
      if (!name || !email || !password || password.length < 6) {
        return sendJSON(res, 400, { error: 'Data tidak lengkap / password minimal 6 karakter.' });
      }

      const passHash = hashPassword(password);
      const stmt = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
      const result = stmt.run(name, email, passHash);

      return sendJSON(res, 201, { id: result.lastInsertRowid, name, email });
    }

    // 2. POST /api/auth/login
    if (method === 'POST' && url === '/api/auth/login') {
      const { email, password } = await getRequestBody(req);
      if (!email || !password) return sendJSON(res, 400, { error: 'Email dan password wajib diisi.' });

      const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
      const user = stmt.get(email);

      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJSON(res, 401, { error: 'Email atau password salah.' });
      }

      // Buat sepasang Token (Access + Refresh)
      const accessToken = generateJWT({ userId: user.id, email: user.email }, ACCESS_TOKEN_EXP);
      const refreshToken = generateJWT({ userId: user.id }, REFRESH_TOKEN_EXP);

      // Simpan Refresh Token ke Database SQLite
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXP).toISOString();
      const insertTokenStmt = db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)');
      insertTokenStmt.run(user.id, refreshToken, expiresAt);

      return sendJSON(res, 200, { message: 'Login sukses', accessToken, refreshToken });
    }

    // 3. POST /api/auth/refresh (Minta Access Token Baru)
    if (method === 'POST' && url === '/api/auth/refresh') {
      const { refreshToken } = await getRequestBody(req);
      if (!refreshToken) return sendJSON(res, 400, { error: 'Refresh token wajib disertakan.' });

      // Validasi struktur dan signature token secara kriptografi
      const payload = verifyJWT(refreshToken);
      if (!payload) return sendJSON(res, 401, { error: 'Refresh token tidak valid atau kedaluwarsa.' });

      // Validasi keberadaan token di database (mencegah token yang sudah di-revoke)
      const tokenCheckStmt = db.prepare('SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ?');
      const storedToken = tokenCheckStmt.get(refreshToken, payload.userId);
      if (!storedToken) return sendJSON(res, 401, { error: 'Refresh token tidak dikenali atau telah dicabut.' });

      // Ambil data user untuk payload baru
      const userStmt = db.prepare('SELECT id, email FROM users WHERE id = ?');
      const user = userStmt.get(payload.userId);

      // Terbitkan Access Token baru
      const newAccessToken = generateJWT({ userId: user.id, email: user.email }, ACCESS_TOKEN_EXP);
      return sendJSON(res, 200, { accessToken: newAccessToken });
    }

    // 4. POST /api/auth/logout (Cabut Hak Akses / Revoke Refresh Token)
    if (method === 'POST' && url === '/api/auth/logout') {
      const { refreshToken } = await getRequestBody(req);
      if (!refreshToken) return sendJSON(res, 400, { error: 'Refresh token wajib disertakan.' });

      // Hapus token dari database agar tidak bisa digunakan kembali
      const deleteTokenStmt = db.prepare('DELETE FROM refresh_tokens WHERE token = ?');
      const result = deleteTokenStmt.run(refreshToken);

      if (result.changes === 0) return sendJSON(res, 404, { error: 'Token tidak ditemukan.' });
      return sendJSON(res, 200, { message: 'Logout sukses, token berhasil dicabut.' });
    }

    // ==========================================
    // RUTE CRUD TERPROTEKSI (Menggunakan accessToken)
    // ==========================================
    if (method === 'GET' && url === '/api/users') {
      if (!authenticate(req, res)) return;
      const stmt = db.prepare('SELECT id, name, email FROM users');
      return sendJSON(res, 200, stmt.all());
    }

    if (method === 'GET' && userId) {
      if (!authenticate(req, res)) return;
      const stmt = db.prepare('SELECT id, name, email FROM users WHERE id = ?');
      const user = stmt.get(userId);
      if (!user) return sendJSON(res, 404, { error: 'User tidak ditemukan' });
      return sendJSON(res, 200, user);
    }

    return sendJSON(res, 404, { error: 'Rute tidak ditemukan' });

  } catch (error) {
    const statusCode = error.message.includes('UNIQUE') ? 409 : 500;
    return sendJSON(res, statusCode, { error: error.message });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server Refresh Token berjalan di http://localhost:${PORT}/`);
});

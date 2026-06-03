//search

//curl "http://localhost:3000/api/users?search=budi" -H "Authorization: Bearer TEKS_TOKEN_ANDA"
//curl "http://localhost:3000/api/users?search=budi&page=1&limit=1" -H "Authorization: Bearer TEKS_TOKEN_ANDA"


import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

// --- Konfigurasi ---
const JWT_SECRET = 'rahasia_super_aman_anda_123!';
const ACCESS_TOKEN_EXP = 15 * 60 * 1000;
const REFRESH_TOKEN_EXP = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL = 1 * 60 * 60 * 1000;

// --- Database Setup ---
const db = new DatabaseSync(':memory:');
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

// --- Scheduler Pembersihan Token ---
function startTokenCleanupScheduler() {
  const cleanupStmt = db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?');
  const runCleanup = () => { try { cleanupStmt.run(new Date().toISOString()); } catch (e) {} };
  setInterval(runCleanup, CLEANUP_INTERVAL).unref();
}

// --- Utility Kriptografi & JWT ---
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
function base64UrlEncode(str) { return Buffer.from(str).toString('base64url'); }
function base64UrlDecode(str) { return Buffer.from(str, 'base64url').toString('utf8'); }

function generateJWT(payload, expiresIn) {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  const encodedHeader = base64UrlEncode(header);
  const finalPayload = { ...payload, exp: Date.now() + expiresIn };
  const encodedPayload = base64UrlEncode(JSON.stringify(finalPayload));
  const signature = createHmac('sha256', JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJWT(token) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    const expectedSignature = createHmac('sha256', JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (err) { return null; }
}

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

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// --- HTTP Server ---
const server = createServer(async (req, res) => {
  const { method, url: reqUrl } = req;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // Gunakan class URL bawaan untuk membedah pathname dan query string
  const parsedUrl = new URL(reqUrl, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  try {
    // [Rute Registrasi & Login tetap sama seperti sebelumnya...]
    if (method === 'POST' && pathname === '/api/auth/register') {
      let body = '';
      await new Promise((res) => { req.on('data', c => body += c); req.on('end', res); });
      const { name, email, password } = JSON.parse(body || '{}');
      const passHash = hashPassword(password);
      const stmt = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
      const result = stmt.run(name, email, passHash);
      return sendJSON(res, 201, { id: result.lastInsertRowid, name, email });
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      let body = '';
      await new Promise((res) => { req.on('data', c => body += c); req.on('end', res); });
      const { email, password } = JSON.parse(body || '{}');
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user || !verifyPassword(password, user.password_hash)) return sendJSON(res, 401, { error: 'Email/password salah.' });
      
      const accessToken = generateJWT({ userId: user.id, email: user.email }, ACCESS_TOKEN_EXP);
      const refreshToken = generateJWT({ userId: user.id }, REFRESH_TOKEN_EXP);
      db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
        .run(user.id, refreshToken, new Date(Date.now() + REFRESH_TOKEN_EXP).toISOString());
      return sendJSON(res, 200, { accessToken, refreshToken });
    }

    // ==========================================================
    // UPDATE ROUTE: GET /api/users dengan Pagination & Pencarian
    // ==========================================================
    if (method === 'GET' && pathname === '/api/users') {
      if (!authenticate(req, res)) return;

      // 1. Ambil query parameter untuk pagination & pencarian
      const page = Math.max(1, parseInt(parsedUrl.searchParams.get('page') || '1', 10));
      const limit = Math.max(1, Math.min(100, parseInt(parsedUrl.searchParams.get('limit') || '10', 10)));
      const search = parsedUrl.searchParams.get('search')?.trim() || '';
      
      const offset = (page - 1) * limit;

      let total = 0;
      let users = [];

      // 2. Kondisional Query: Jika ada kata kunci pencarian
      if (search) {
        // SQLite menggunakan simbol '%' sebagai wildcard untuk pencarian parsial
        const searchPattern = `%${search}%`;

        // Hitung total data yang cocok dengan kriteria pencarian saja
        const countStmt = db.prepare(`
          SELECT COUNT(*) as total FROM users 
          WHERE name LIKE ? OR email LIKE ?
        `);
        total = countStmt.get(searchPattern, searchPattern).total;

        // Ambil data yang cocok dengan limit dan offset
        const dataStmt = db.prepare(`
          SELECT id, name, email FROM users 
          WHERE name LIKE ? OR email LIKE ?
          LIMIT ? OFFSET ?
        `);
        users = dataStmt.all(searchPattern, searchPattern, limit, offset);
      } else {
        // Jika tidak ada parameter pencarian, jalankan query standar (ambil semua)
        const countStmt = db.prepare('SELECT COUNT(*) as total FROM users');
        total = countStmt.get().total;

        const dataStmt = db.prepare('SELECT id, name, email FROM users LIMIT ? OFFSET ?');
        users = dataStmt.all(limit, offset);
      }

      const totalPages = Math.ceil(total / limit);

      // 3. Kembalikan data beserta meta-data yang sudah disaring
      return sendJSON(res, 200, {
        meta: {
          totalData: total,
          currentPage: page,
          limitPerPage: limit,
          totalPages: totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          searchQuery: search || null // Mengembalikan query pencarian aktif ke client
        },
        data: users
      });
    }


    return sendJSON(res, 404, { error: 'Rute tidak ditemukan' });

  } catch (error) {
    return sendJSON(res, 500, { error: error.message });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server Pagination berjalan di http://localhost:${PORT}/`);
  startTokenCleanupScheduler();
});

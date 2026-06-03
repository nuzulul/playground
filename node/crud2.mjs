//jwt auth

//curl -X POST http://localhost:3000/api/auth/register -d "{\"name\":\"Budi\",\"email\":\"budi@example.com\",\"password\":\"secretpassword\"}"
//curl -X POST http://localhost:3000/api/auth/login -d "{\"email\":\"budi@example.com\",\"password\":\"secretpassword\"}"
//curl http://localhost:3000/api/users -H "Authorization: Bearer TEKS_TOKEN_ANDA"


import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

// --- Konfigurasi JWT ---
const JWT_SECRET = 'rahasia_super_aman_anda_123!'; // Di produksi, gunakan process.env.JWT_SECRET

// --- Database Setup ---
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )
`);

// --- Utility: Utility Hash Password ---
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

// --- Utility: Pembuatan & Verifikasi JWT Native ---
function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function generateJWT(payload) {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
    
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJWT(token) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) return null;

    // Verifikasi tanda tangan (Signature Validation)
    const expectedSignature = createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    
    // Validasi masa berlaku (Expiration Check)
    if (payload.exp && Date.now() > payload.exp) return null;

    return payload;
  } catch (err) {
    return null;
  }
}

// --- Middleware Authentication (Native Guard) ---
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

  return user; // Mengembalikan data user yang terenkripsi di token
}

// --- Helper HTTP ---
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {console.log('body',body)
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
    // 1. ROUTE: POST /api/auth/register (Public)
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

    // 2. ROUTE: POST /api/auth/login (Public)
    if (method === 'POST' && url === '/api/auth/login') {
      const { email, password } = await getRequestBody(req);
      if (!email || !password) return sendJSON(res, 400, { error: 'Email dan password wajib diisi.' });

      const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
      const user = stmt.get(email);

      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJSON(res, 401, { error: 'Email atau password salah.' });
      }

      // Buat token berlaku selama 1 jam
      const token = generateJWT({
        userId: user.id,
        email: user.email,
        exp: Date.now() + 60 * 60 * 1000 
      });

      return sendJSON(res, 200, { message: 'Login sukses', token });
    }

    // ==========================================
    // RUTE YANG DIPROTEKSI (Butuh Header Authorization)
    // ==========================================

    // 3. ROUTE: GET /api/users (Protected)
    if (method === 'GET' && url === '/api/users') {
      if (!authenticate(req, res)) return; // Blokir jika auth gagal
      
      const stmt = db.prepare('SELECT id, name, email FROM users');
      return sendJSON(res, 200, stmt.all());
    }

    // 4. ROUTE: GET /api/users/:id (Protected)
    if (method === 'GET' && userId) {
      if (!authenticate(req, res)) return;

      const stmt = db.prepare('SELECT id, name, email FROM users WHERE id = ?');
      const user = stmt.get(userId);
      if (!user) return sendJSON(res, 404, { error: 'User tidak ditemukan' });
      return sendJSON(res, 200, user);
    }

    // 5. ROUTE: PUT /api/users/:id (Protected)
    if (method === 'PUT' && userId) {
      const currentUser = authenticate(req, res);
      if (!currentUser) return;

      // Opsi tambahan: Cegah user mengubah data profil orang lain
      if (currentUser.userId !== userId) {
        return sendJSON(res, 403, { error: 'Anda tidak diizinkan mengubah profil user lain.' });
      }

      const { name, email } = await getRequestBody(req);
      const stmt = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
      const result = stmt.run(name, email, userId);
      
      if (result.changes === 0) return sendJSON(res, 404, { error: 'User tidak ditemukan' });
      return sendJSON(res, 200, { id: userId, name, email });
    }

    // 6. ROUTE: DELETE /api/users/:id (Protected)
    if (method === 'DELETE' && userId) {
      const currentUser = authenticate(req, res);
      if (!currentUser) return;

      if (currentUser.userId !== userId) {
        return sendJSON(res, 403, { error: 'Anda tidak diizinkan menghapus user lain.' });
      }

      const stmt = db.prepare('DELETE FROM users WHERE id = ?');
      const result = stmt.run(userId);
      if (result.changes === 0) return sendJSON(res, 404, { error: 'User tidak ditemukan' });
      return sendJSON(res, 200, { message: `User ${userId} berhasil dihapus` });
    }

    return sendJSON(res, 404, { error: 'Rute tidak ditemukan' });

  } catch (error) {
    const statusCode = error.message.includes('UNIQUE') ? 409 : 500;
    const msg = error.message.includes('UNIQUE') ? 'Email sudah terdaftar.' : error.message;
    return sendJSON(res, statusCode, { error: msg });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server JWT berjalan di http://localhost:${PORT}/`);
});

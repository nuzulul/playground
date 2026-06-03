//upload 

//curl -X POST http://localhost:3000/api/users/1/avatar -H "Authorization: Bearer TEKS_TOKEN_ANDA" -F "avatar=@/path/ke/foto/avatar.png"


import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const JWT_SECRET = 'rahasia_super_aman_anda_123!';
const UPLOADS_DIR = join(process.cwd(), 'uploads');

// Pastikan folder uploads ada saat aplikasi berjalan
try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}

// --- Database Setup (Ditambah kolom avatar) ---
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// --- [Fungsi-fungsi Utility, Hash, JWT, & Authenticate sama seperti sebelumnya] ---
function base64UrlEncode(str) { return Buffer.from(str).toString('base64url'); }
function base64UrlDecode(str) { return Buffer.from(str, 'base64url').toString('utf8'); }
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
  const token = authHeader.split(' ');
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
  const parsedUrl = new URL(reqUrl, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Endpoint OPTIONS untuk CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // Regex rute khusus upload: /api/users/:id/avatar
  const avatarUrlRegex = /^\/api\/users\/(\d+)\/avatar$/;
  const matchAvatar = pathname.match(avatarUrlRegex);
  const userId = matchAvatar ? parseInt(matchAvatar[1], 10) : null;

  try {
    // ==========================================================
    // RUTE BARU: POST /api/users/:id/avatar (Upload File)
    // ==========================================================
    if (method === 'POST' && userId) {
      // 1. Otorisasi Pengguna
      const currentUser = authenticate(req, res);
      if (!currentUser) return;

      if (currentUser.userId !== userId) {
        return sendJSON(res, 403, { error: 'Anda tidak diizinkan mengubah avatar user lain.' });
      }

      // 2. Validasi Tipe Konten (Harus multipart/form-data)
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('multipart/form-data')) {
        return sendJSON(res, 400, { error: 'Format request harus multipart/form-data.' });
      }

      // 3. Trik Native Modern: Bungkus biner request ke dalam Web API Request standard
      // Ini memungkinkan kita memakai fungsi .formData() bawaan Node.js tanpa library luar
      const webReq = new Request(`http://localhost${reqUrl}`, {
        method: req.method,
        headers: req.headers,
        body: req // Mengalirkan stream req langsung
      });

      const formData = await webReq.formData();
      const file = formData.get('avatar'); // Mengambil field bernama 'avatar'

      if (!file || typeof file === 'string') {
        return sendJSON(res, 400, { error: 'File gambar tidak ditemukan pada field "avatar".' });
      }

      // 4. Validasi Ekstensi & Tipe File (Hanya Gambar)
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      const fileExt = extname(file.name).toLowerCase();
      if (!allowedExtensions.includes(fileExt) || !file.type.startsWith('image/')) {
        return sendJSON(res, 400, { error: 'Format file tidak didukung. Hanya menerima JPG, PNG, atau WEBP.' });
      }

      // 5. Validasi Ukuran File (Maksimal 2MB)
      const MAX_SIZE = 2 * 1024 * 1024; // 2 MegaBytes
      if (file.size > MAX_SIZE) {
        return sendJSON(res, 400, { error: 'Ukuran file terlalu besar. Maksimal 2MB.' });
      }

      // 6. Buat nama unik agar tidak bentrok, lalu simpan file ke disk
      const uniqueFileName = `${userId}-${Date.now()}${fileExt}`;
      const destinationPath = join(UPLOADS_DIR, uniqueFileName);

      // Ambil arrayBuffer biner dari file, ubah ke Buffer Node.js, lalu tulis ke disk
      const arrayBuffer = await file.arrayBuffer();
      writeFileSync(destinationPath, Buffer.from(arrayBuffer));

      // 7. Update nama file avatar ke Database SQLite
      const updateStmt = db.prepare('UPDATE users SET avatar = ? WHERE id = ?');
      updateStmt.run(uniqueFileName, userId);

      return sendJSON(res, 200, {
        message: 'Foto profil berhasil diunggah.',
        avatar: uniqueFileName
      });
    }

    return sendJSON(res, 404, { error: 'Rute tidak ditemukan' });

  } catch (error) {
    return sendJSON(res, 500, { error: `Gagal memproses file: ${error.message}` });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server Upload File berjalan di http://localhost:${PORT}/`);
});

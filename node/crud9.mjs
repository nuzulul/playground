//static

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const JWT_SECRET = 'rahasia_super_aman_anda_123!';
const UPLOADS_DIR = join(process.cwd(), 'uploads');

try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}

// --- Database Setup ---
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT NULL
  )
`);

// --- Helper JSON ---
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

  // Handle CORS OPTIONS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // ==========================================================
  // FITUR BARU: Static File Server (Akses Gambar Publik)
  // ==========================================================
  if (method === 'GET' && pathname.startsWith('/uploads/')) {
    try {
      // Ambil nama file dari URL (misal: /uploads/foto.png -> foto.png)
      const fileName = pathname.replace('/uploads/', '');
      
      // Keamanan: Cegah Directory Traversal Attack (misal user iseng input /uploads/../../etc/passwd)
      if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        return sendJSON(res, 403, { error: 'Akses ditolak.' });
      }

      const filePath = join(UPLOADS_DIR, fileName);

      // Cek apakah file ada di disk
      const fileStats = statSync(filePath);
      if (!fileStats.isFile()) {
        return sendJSON(res, 404, { error: 'File tidak ditemukan.' });
      }

      // Tentukan Content-Type berdasarkan ekstensi file gambar
      const ext = extname(fileName).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      // Tulis header sukses dengan menyertakan ukuran file
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': fileStats.size,
        'Access-Control-Allow-Origin': '*' // Izinkan frontend membaca gambar
      });

      // Alirkan file menggunakan stream (hemat RAM server)
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);
      return;

    } catch (error) {
      // Jika file tidak ada, statSync akan melempar error ENOENT
      if (error.code === 'ENOENT') {
        return sendJSON(res, 404, { error: 'File gambar tidak ditemukan.' });
      }
      return sendJSON(res, 500, { error: `Gagal memuat file: ${error.message}` });
    }
  }

  // --- Regex & Skenario Rute Lain (/api/auth, /api/users, dst tetap di bawah sini) ---
  const avatarUrlRegex = /^\/api\/users\/(\d+)\/avatar$/;
  const matchAvatar = pathname.match(avatarUrlRegex);
  const userId = matchAvatar ? parseInt(matchAvatar, 10) : null;

  try {
    // [Logika rute POST /api/users/:id/avatar dari langkah sebelumnya...]
    if (method === 'POST' && userId) {
      // (Kode upload file Anda yang kemarin diletakkan di sini...)
      // Setelah writeFileSync berhasil, rute statis di atas siap melayani URL filenya.
    }
    
    // Default 404 jika rute API tidak cocok
    if (!pathname.startsWith('/uploads/')) {
      return sendJSON(res, 404, { error: 'Rute tidak ditemukan' });
    }
  } catch (err) {
    return sendJSON(res, 500, { error: err.message });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server beserta Static File Server aktif di http://localhost:${PORT}/`);
});

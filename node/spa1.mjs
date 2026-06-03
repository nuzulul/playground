import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3000;

// Cara mendapatkan __dirname di ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // Parsing URL untuk membuang query strings (misal: /style.css?v=1)
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(PUBLIC_DIR, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  
  let extname = path.extname(filePath);

  // Jika tidak ada ekstensi (SPA route), gunakan index.html
  if (!extname) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
    extname = '.html';
  }

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback untuk SPA: Kirim index.html jika file tidak ditemukan
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (errIndex, indexContent) => {
          if (errIndex) {
            res.writeHead(404);
            res.end('404: Index Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexContent, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`SPA Server (ESM) running at http://localhost:${PORT}/`);
});

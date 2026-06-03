const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  let extname = path.extname(filePath);

  // Jika tidak ada ekstensi file (berarti kemungkinan route SPA), arahkan ke index.html
  if (!extname) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
    extname = '.html';
  }

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Jika file spesifik (seperti gambar/css) benar-benar tidak ada, baru kirim 404
        // Tapi jika itu request halaman, fallback ke index.html
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (error, indexContent) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(indexContent, 'utf-8');
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
  console.log(`SPA Server running at http://localhost:${PORT}/`);
});

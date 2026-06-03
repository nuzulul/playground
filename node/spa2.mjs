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
            res.end(indexHtml, 'utf-8');
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

const indexHtml = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vanilla SPA</title>
	<style>
		/* Your CSS styling goes here */
		body {
			font-family: Arial, sans-serif;
			background-color: #f4f4f9;
			text-align: center;
			padding-top: 50px;
		}
		button {
			padding: 10px 20px;
			font-size: 16px;
			cursor: pointer;
		}
	</style>
</head>
<body>
    <nav>
        <!-- Gunakan data-link untuk navigasi tanpa reload -->
        <a href="/" data-link>Home</a>
        <a href="/about" data-link>About</a>
        <a href="/contact" data-link>Contact</a>
    </nav>

    <!-- Konten halaman akan muncul di sini -->
    <div id="app"></div>

    <script type="module">
		const routes = {
			'/': { title: 'Home', render: () => '<h1>Selamat Datang!</h1><p>Ini adalah halaman utama.</p>' },
			'/about': { title: 'About', render: () => '<h1>Tentang Kami</h1><p>Kami sedang belajar Node.js Native.</p>' },
			'/contact': { title: 'Contact', render: () => '<h1>Kontak</h1><p>Hubungi kami di email@contoh.com</p>' },
			'/404': { title: 'Not Found', render: () => '<h1>404</h1><p>Halaman tidak ditemukan.</p>' }
		};

		const router = () => {
			const path = window.location.pathname;
			const route = routes[path] || routes['/404'];

			document.title = route.title;
			document.getElementById('app').innerHTML = route.render();
		};

		// Fungsi untuk pindah halaman tanpa reload
		const navigateTo = (url) => {
			window.history.pushState(null, null, url);
			router();
		};

		// Tangkap klik pada link yang memiliki atribut [data-link]
		window.addEventListener('click', (e) => {
			if (e.target.matches('[data-link]')) {
				e.preventDefault();
				navigateTo(e.target.href);
			}
		});

		// Tangkap tombol 'Back' atau 'Forward' di browser
		window.addEventListener('popstate', router);

		// Jalankan router saat halaman pertama kali dimuat
		document.addEventListener('DOMContentLoaded', router);
	
	</script>
</body>
</html>

`;

server.listen(PORT, () => {
  console.log(`SPA Server (ESM) running at http://localhost:${PORT}/`);
});

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

  // HANDLING POST REQUEST (Form Submission)
  if (req.method === 'POST' && parsedUrl.pathname === '/api/contact') {
    let body = '';

    // Ambil data yang dikirim client secara bertahap
    req.on('data', chunk => {
      body += chunk.toString();
    });

    // Setelah semua data diterima
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('Data diterima:', data);

        // Simulasi respon sukses
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          message: `Halo ${data.nama}, pesan kamu sudah diterima!` 
        }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Format data salah" }));
      }
    });
    return; // Hentikan eksekusi agar tidak lanjut ke route statis
  }
  
  // --- BAGIAN API ---
  if (parsedUrl.pathname === '/api/user') {
    const userData = {
      id: 1,
      name: "Budi Programmer",
      status: "Belajar Node.js Native"
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(userData));
  }
  // ------------------
  
  
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
            res.writeHead(200);
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
		<a href="/profile" data-link>Profile</a>
		<a href="/contact" data-link>Contact</a>
    </nav>

    <!-- Konten halaman akan muncul di sini -->
    <div id="app"></div>

    <script type="module">
		const routes = {
			'/': { title: 'Home', render: () => '<h1>Selamat Datang!</h1><p>Ini adalah halaman utama.</p>' },
			'/about': { title: 'About', render: () => '<h1>Tentang Kami</h1><p>Kami sedang belajar Node.js Native.</p>' },
			'/404': { title: 'Not Found', render: () => '<h1>404</h1><p>Halaman tidak ditemukan.</p>' },
			'/profile': { 
				title: 'User Profile', 
				render: async () => {
					// Tampilkan loading sebentar
					const container = document.createElement('div');
					container.innerHTML = '<h1>Profile</h1><p id="data">Memuat data...</p>';
					
					// Ambil data dari API internal kita
					try {
						const response = await fetch('/api/user');
						const user = await response.json();
						
						// Update konten setelah data dapat
						return "<h1>Profile</h1>"+
								"<p><strong>Nama:</strong>"+user.name+"</p>"+
								"<p><strong>Status:</strong>"+user.status+"</p>";
					} catch (err) {
						return '<h1>Error</h1><p>Gagal mengambil data.</p>';
					}
				} 
			},
			'/contact': {
				title: 'Hubungi Kami',
				render: () => ''+
					'<h1>Kontak Kami</h1>'+
					'<form id="contactForm">'+
						'<input type="text" id="nama" placeholder="Nama Anda" required><br><br>'+
						'<textarea id="pesan" placeholder="Pesan"></textarea><br><br>'+
						'<button type="submit">Kirim Pesan</button>'+
					'</form>'+
					'<p id="responseMsg"></p>'+
				'',
				afterRender: () => {
					const form = document.getElementById('contactForm');
					form.addEventListener('submit', async (e) => {
						e.preventDefault();
						
						const formData = {
							nama: document.getElementById('nama').value,
							pesan: document.getElementById('pesan').value
						};

						const response = await fetch('/api/contact', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(formData)
						});

						const result = await response.json();
						document.getElementById('responseMsg').innerText = result.message;
					});
				}
			}			
		};

		const router = async () => {
			const path = window.location.pathname;
			const route = routes[path] || routes['/404'];

			document.title = route.title;
			
			// Cek apakah render berupa fungsi async atau string biasa
			const content = typeof route.render === 'function' 
							? await route.render() 
							: route.render;

			document.getElementById('app').innerHTML = content;
			
			// Jalankan fungsi tambahan (seperti event listener) setelah HTML muncul
			if (route.afterRender) route.afterRender();
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

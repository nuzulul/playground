import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3000;
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure the upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

const server = http.createServer((req, res) => {
  // Check if the request is a POST route intended for uploads
  if (req.method === 'POST' && req.url === '/upload') {
    
    // Grab the intended filename from headers, or fallback to a timestamp
    const fileName = req.headers['x-file-name'] || `upload-${Date.now()}.bin`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    
    // Create a native write stream to save the file chunk-by-chunk
    const writeStream = fs.createWriteStream(filePath);

    // Pipe the readable incoming request stream directly into the file write stream
    req.pipe(writeStream);

    // Handle stream completion
    writeStream.on('finish', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'File uploaded successfully!', fileName }));
    });

    // Handle potential errors during streaming
    writeStream.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Write failed', details: err.message }));
    });

  } else {
    // Fallback for non-matching routes
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Native upload server running on http://localhost:${PORT}`);
});

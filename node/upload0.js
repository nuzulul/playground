const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
    // 1. Serve the HTML Form
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <body>
                <h2>Native Node.js File Uploader</h2>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="file" name="fileInput" required><br><br>
                    <button type="submit">Upload File</button>
                </form>
            </body>
            </html>
        `);
    } 
    // 2. Handle the File Upload
    else if (req.method === 'POST' && req.url === '/upload') {
        const contentType = req.headers['content-type'];
        
        // Ensure the request is multipart/form-data
        if (!contentType || !contentType.includes('multipart/form-data')) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Bad Request: Expected multipart form data.');
        }

        // Extract the multipart boundary string
        const boundary = contentType.split('boundary=')[1];
        let bodyChunks = [];

        // Collect incoming binary stream buffers
        req.on('data', (chunk) => {
            bodyChunks.push(chunk);
        });

        req.on('end', () => {
            const buffer = Buffer.concat(bodyChunks);
            
            try {
                // Parse out the raw file data out of the multipart wrappers
                const fileData = parseMultipart(buffer, boundary);
                
                if (!fileData) {
                    throw new Error('Could not parse file data.');
                }

                // Ensure an uploads directory exists
                const uploadDir = path.join(__dirname, 'uploads');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir);
                }

                // Write the raw binary file to disk
                const filePath = path.join(uploadDir, fileData.filename);
                fs.writeFileSync(filePath, fileData.data);

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`File successfully uploaded natively: ${fileData.filename}`);
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Upload failed: ${err.message}`);
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Helper function to extract filename and raw file data from the multipart buffer
function parseMultipart(buffer, boundary) {
    const boundaryString = `--${boundary}`;
    const boundaryBuffer = Buffer.from(boundaryString);
    
    // Find where the file content header begins
    const headerStart = buffer.indexOf(boundaryBuffer) + boundaryBuffer.length;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    const headers = buffer.slice(headerStart, headerEnd).toString();

    // Extract filename via regex
    const filenameMatch = headers.match(/filename="(.+?)"/);
    if (!filenameMatch) return null;
    const filename = filenameMatch[1];

    // Isolate the pure binary content of the file
    const fileStart = headerEnd + 4; // Skip the \r\n\r\n delimiter
    const fileEnd = buffer.indexOf(boundaryBuffer, fileStart) - 4; // Discard trailing boundary and newlines
    const data = buffer.slice(fileStart, fileEnd);

    return { filename, data };
}

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

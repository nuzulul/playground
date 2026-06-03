import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const PORT = 3000;

// 1. Initialize native SQLite database in-memory or to a file path
//const db = new DatabaseSync('images_store.db');
const db = new DatabaseSync(':memory:');

// 2. Create table with a BLOB column for binary image storage
db.exec(`
  CREATE TABLE IF NOT EXISTS user_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    mime_type TEXT,
    image_data BLOB
  )
`);

// Prepare the insert statement for efficiency
const insertStmt = db.prepare(`
  INSERT INTO user_images (filename, mime_type, image_data) 
  VALUES (?, ?, ?)
`);

const server = createServer((req, res) => {
	
	
	  // Handle GET route to render/serve the image back to a browser
	  const match = req.url.match(/^\/image\/(\d+)$/);
	  if (match && req.method.toLowerCase() === 'get') {
		const imageId = match[1];
		
		const getStmt = db.prepare('SELECT mime_type, image_data FROM user_images WHERE id = ?');
		const row = getStmt.get(imageId);

		if (!row) {
		  res.writeHead(404, { 'Content-Type': 'text/plain' });
		  return res.end('Image not found');
		}

		// Set matching MIME type headers and send the raw buffer payload back directly
		res.writeHead(200, { 
		  'Content-Type': row.mime_type,
		  'Content-Length': row.image_data.length 
		});
		return res.end(row.image_data); // Sends the raw BLOB data buffer
	  }
	
	
	
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

				// Execute insert query by passing the raw binary buffer straight into the BLOB column
				let out = insertStmt.run(fileData.filename, fileData.mimeType, fileData.data);
				let id = out.lastInsertRowid

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`File successfully uploaded natively id: ${id} filename: ${fileData.filename}`);
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
	
	//Extract mime Type
	const mimeType = headers.split('Content-Type: ').at(-1)

    // Isolate the pure binary content of the file
    const fileStart = headerEnd + 4; // Skip the \r\n\r\n delimiter
    const fileEnd = buffer.indexOf(boundaryBuffer, fileStart) - 4; // Discard trailing boundary and newlines
    const data = buffer.slice(fileStart, fileEnd);

    return { filename, data, mimeType };
}

async function parseBufferForm(buffer, contentTypeHeader) {
  // 1. Create a Web API Response object from the buffer
  const response = new Response(buffer, {
    headers: { 'Content-Type': contentTypeHeader }
  });

  // 2. Consume the response body as native FormData
  const formData = await response.formData();

  // 3. Iterate over fields and files
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      console.log(`Text field [${key}]: ${value}`);
    } else {
      // It is a File/Blob object
      console.log(`File field [${key}]: ${value.name}`);
      console.log(`MIME type: ${value.type}`);
      
      // Convert the File back to a Node.js Buffer if needed
      const fileBuffer = Buffer.from(await value.arrayBuffer());
    }
  }
}

// Common hexadecimal magic numbers
const MAGIC_NUMBERS = {
  'ffd8ff': 'image/jpeg',
  '89504e47': 'image/png',
  '47494638': 'image/gif',
  '25504446': 'application/pdf'
};

function validateFileMagicNumber(filePath) {
  return new Promise((resolve, reject) => {
    // Open the file for reading
    fs.open(filePath, 'r', (err, fd) => {
      if (err) return reject(err);

      // Read only the first 4 bytes needed for basic signatures
      const buffer = Buffer.alloc(4);

      fs.read(fd, buffer, 0, 4, 0, (readErr, bytesRead) => {
        fs.close(fd, () => {}); // Always close file descriptor

        if (readErr) return reject(readErr);

        // Convert the buffer to a hex string
        const hexSignature = buffer.toString('hex', 0, bytesRead).toLowerCase();

        // Check if the hex matches our known signatures
        let detectedType = null;
        for (const [signature, mimeType] of Object.entries(MAGIC_NUMBERS)) {
          if (hexSignature.startsWith(signature)) {
            detectedType = mimeType;
            break;
          }
        }

        resolve(detectedType);
      });
    });
  });
}

// Usage Example
/*validateFileMagicNumber('uploads/user_avatar.tmp')
  .then(mimeType => {
    if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      console.log('Valid image file!');
    } else {
      console.log('Invalid file type detected.');
    }
  })
  .catch(err => console.error('Error reading file:', err));
*/

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

// --- Database Setup ---
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
  )
`);

// --- Helper: Parse Request Body ---
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.getJSON(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// --- Helper: Send JSON Response ---
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// --- HTTP Server ---
const server = createServer(async (req, res) => {
  const { method, url } = req;
  
  // Extract ID from URL if it matches /api/users/:id (e.g., /api/users/5)
  const userUrlRegex = /^\/api\/users\/(\d+)$/;
  const match = url.match(userUrlRegex);
  const userId = match ? parseInt(match[1], 10) : null;

  try {
    // 1. ROUTE: GET /api/users (Read All)
    if (method === 'GET' && url === '/api/users') {
      const stmt = db.prepare('SELECT * FROM users');
      return sendJSON(res, 200, stmt.all());
    }

    // 2. ROUTE: GET /api/users/:id (Read One)
    if (method === 'GET' && userId) {
      const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
      const user = stmt.get(userId);
      if (!user) return sendJSON(res, 404, { error: 'User not found' });
      return sendJSON(res, 200, user);
    }

    // 3. ROUTE: POST /api/users (Create)
    if (method === 'POST' && url === '/api/users') {
      const body = await getRequestBody(req);
      if (!body.name || !body.email) {
        return sendJSON(res, 400, { error: 'Name and email are required' });
      }

      const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
      const result = stmt.run(body.name, body.email);
      return sendJSON(res, 201, { id: result.lastInsertRowid, name: body.name, email: body.email });
    }

    // 4. ROUTE: PUT /api/users/:id (Update)
    if (method === 'PUT' && userId) {
      const body = await getRequestBody(req);
      if (!body.name || !body.email) {
        return sendJSON(res, 400, { error: 'Name and email are required' });
      }

      const stmt = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
      const result = stmt.run(body.name, body.email, userId);
      
      if (result.changes === 0) return sendJSON(res, 404, { error: 'User not found' });
      return sendJSON(res, 200, { id: userId, name: body.name, email: body.email });
    }

    // 5. ROUTE: DELETE /api/users/:id (Delete)
    if (method === 'DELETE' && userId) {
      const stmt = db.prepare('DELETE FROM users WHERE id = ?');
      const result = stmt.run(userId);
      
      if (result.changes === 0) return sendJSON(res, 404, { error: 'User not found' });
      return sendJSON(res, 200, { message: `User ${userId} deleted successfully` });
    }

    // 404 Catch-all
    return sendJSON(res, 404, { error: 'Route not found' });

  } catch (error) {
    // Handle database or runtime errors (e.g., SQLite UNIQUE constraint failure)
    const statusCode = error.message.includes('UNIQUE') ? 409 : 500;
    return sendJSON(res, statusCode, { error: error.message });
  }
});

// Start Server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

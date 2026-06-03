//data validation

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
  )
`);

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function validateUser(body) {
  const errors = [];
  const name = body.name?.toString().trim();
  const email = body.email?.toString().trim();

  if (!name) {
    errors.push('Name field is required.');
  } else if (name.length < 2) {
    errors.push('Name must be at least 2 characters long.');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    errors.push('Email field is required.');
  } else if (!emailRegex.test(email)) {
    errors.push('Provided email format is invalid.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: { name, email }
  };
}

const server = createServer(async (req, res) => {
  const { method, url } = req;
  const userUrlRegex = /^\/api\/users\/(\d+)$/;
  const match = url.match(userUrlRegex);
  const userId = match ? parseInt(match, 10) : null;

  try {
    if (method === 'GET' && url === '/api/users') {
      const stmt = db.prepare('SELECT * FROM users');
      return sendJSON(res, 200, stmt.all());
    }

    if (method === 'GET' && userId) {
      const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
      const user = stmt.get(userId);
      if (!user) return sendJSON(res, 404, { error: 'User not found' });
      return sendJSON(res, 200, user);
    }

    // --- CREATE with Validation ---
    if (method === 'POST' && url === '/api/users') {
      const body = await getRequestBody(req);
      const validation = validateUser(body);

      // Return 422 Unprocessable Entity if data fails validation rules
      if (!validation.isValid) {
        return sendJSON(res, 422, { errors: validation.errors });
      }

      const { name, email } = validation.data;
      const stmt = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
      const result = stmt.run(name, email);
      return sendJSON(res, 201, { id: result.lastInsertRowid, name, email });
    }

    // --- UPDATE with Validation ---
    if (method === 'PUT' && userId) {
      const body = await getRequestBody(req);
      const validation = validateUser(body);

      if (!validation.isValid) {
        return sendJSON(res, 422, { errors: validation.errors });
      }

      const { name, email } = validation.data;
      const stmt = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
      const result = stmt.run(name, email, userId);
      
      if (result.changes === 0) return sendJSON(res, 404, { error: 'User not found' });
      return sendJSON(res, 200, { id: userId, name, email });
    }

    if (method === 'DELETE' && userId) {
      const stmt = db.prepare('DELETE FROM users WHERE id = ?');
      const result = stmt.run(userId);
      if (result.changes === 0) return sendJSON(res, 404, { error: 'User not found' });
      return sendJSON(res, 200, { message: `User ${userId} deleted successfully` });
    }

    return sendJSON(res, 404, { error: 'Route not found' });

  } catch (error) {
    const statusCode = error.message.includes('UNIQUE') ? 409 : 500;
    const message = error.message.includes('UNIQUE') ? 'Email already exists.' : error.message;
    return sendJSON(res, statusCode, { error: message });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

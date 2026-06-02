const http = require('http'); // Built-in Node.js HTTP module

// Mock data store
let users = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
];

// Helper function to read the incoming JSON request body
const getRequestBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
    });
};

// Create the HTTP server
const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    // 1. Set global headers for JSON content
    res.setHeader('Content-Type', 'application/json');

    // 2. Route: GET /api/users (Fetch all users)
    if (url === '/api/users' && method === 'GET') {
        res.writeHead(200);
        return res.end(JSON.stringify(users));
    }

    // 3. Route: POST /api/users (Create a new user)
    if (url === '/api/users' && method === 'POST') {
        try {
            const body = await getRequestBody(req);
            if (!body.name) {
                res.writeHead(400);
                return res.end(JSON.stringify({ error: 'Name is required' }));
            }
            const newUser = { id: users.length + 1, name: body.name };
            users.push(newUser);
            res.writeHead(201);
            return res.end(JSON.stringify(newUser));
        } catch (err) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
    }

    // 4. Route: DELETE /api/users/:id (Dynamic parameter routing)
    if (url.startsWith('/api/users/') && method === 'DELETE') {
        const id = parseInt(url.split('/')[3], 10);
        const userExists = users.some(user => user.id === id);

        if (!userExists) {
            res.writeHead(404);
            return res.end(JSON.stringify({ error: 'User not found' }));
        }

        users = users.filter(user => user.id !== id);
        res.writeHead(200);
        return res.end(JSON.stringify({ success: true, message: `User ${id} deleted` }));
    }

    // 5. Fallback Route: 404 Not Found
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Route not found' }));
});

// Start listening on port 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running smoothly on http://localhost:${PORT}`);
});

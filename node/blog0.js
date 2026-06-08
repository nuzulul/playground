const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'blog.json');

// Helper function to read posts from JSON file
const getPosts = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

// Helper function to save posts to JSON file
const savePosts = (posts) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
};

// Helper function to parse HTML layouts
const renderHTML = (title, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; max-width: 600px; margin: 40px auto; padding: 0 20px; color: #333; }
        h1, h2 { color: #111; }
        a { color: #0066cc; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .post { margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
        .date { color: #666; font-size: 0.9rem; }
        form div { margin-bottom: 15px; }
        input[type="text"], textarea { width: 100%; padding: 8px; font-size: 1rem; }
        button { background: #333; color: #fff; padding: 10px 15px; border: none; cursor: pointer; }
        button:hover { background: #555; }
    </style>
</head>
<body>
    <header>
        <nav><a href="/">🏠 Home</a> | <a href="/new">✍️ New Post</a></nav>
    </header>
    <main>${content}</main>
</body>
</html>
`;

// Create the server
const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;

    // Route: GET / (Homepage - List all posts)
    if (url.pathname === '/' && method === 'GET') {
        const posts = getPosts();
        let content = '<h1>Welcome to My Blog</h1>';
        
        if (posts.length === 0) {
            content += '<p>No posts found. Create one!</p>';
        } else {
            posts.forEach(post => {
                content += `
                    <div class="post">
                        <h2><a href="/post?id=${post.id}">${post.title}</a></h2>
                        <p class="date">Published on ${post.date}</p>
                        <p>${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}</p>
                    </div>
                `;
            });
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(renderHTML('My Simple Blog', content));
    }

    // Route: GET /post?id=X (View Single Post)
    if (url.pathname === '/post' && method === 'GET') {
        const id = parseInt(url.searchParams.get('id'));
        const posts = getPosts();
        const post = posts.find(p => p.id === id);

        if (!post) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            return res.end(renderHTML('404 Not Found', '<h1>Post Not Found</h1><a href="/">Back home</a>'));
        }

        const content = `
            <h1>${post.title}</h1>
            <p class="date">Published on ${post.date}</p>
            <p style="white-space: pre-wrap;">${post.content}</p>
            <p><a href="/">← Back to Homepage</a></p>
        `;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(renderHTML(post.title, content));
    }

    // Route: GET /new (Show Creation Form)
    if (url.pathname === '/new' && method === 'GET') {
        const content = `
            <h1>Create New Post</h1>
            <form action="/new" method="POST">
                <div>
                    <label>Title</label><br>
                    <input type="text" name="title" required>
                </div>
                <div>
                    <label>Content</label><br>
                    <textarea name="content" rows="8" required></textarea>
                </div>
                <button type="submit">Publish Post</button>
            </form>
        `;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(renderHTML('New Post', content));
    }

    // Route: POST /new (Handle Form Submission)
    if (url.pathname === '/new' && method === 'POST') {
        let body = '';
        
        // Listen for incoming data stream
        req.on('data', chunk => {
            body += chunk.toString();
        });

        // Parse stream once complete
        req.on('end', () => {
            const params = new URLSearchParams(body);
            const title = params.get('title');
            const content = params.get('content');

            if (title && content) {
                const posts = getPosts();
                const newPost = {
                    id: posts.length > 0 ? posts[posts.length - 1].id + 1 : 1,
                    title,
                    content,
                    date: new Date().toISOString().split('T')[0]
                };

                posts.push(newPost);
                savePosts(posts);
            }

            // Redirect back to homepage
            res.writeHead(302, { 'Location': '/' });
            return res.end();
        });
        return;
    }

    // Fallback: 404 Route
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(renderHTML('404 Not Found', '<h1>Page Not Found</h1>'));
});

// Start Server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

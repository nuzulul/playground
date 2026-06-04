const http = require('http'); // Built-in Node.js HTTP module

// rateLimiter.js
const requestTracker = new Map();

// Configuration
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS = 100;    // Limit each IP to 100 requests per window

function nativeRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  if (!requestTracker.has(ip)) {
    // First request from this IP
    requestTracker.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return next();
  }

  const clientData = requestTracker.get(ip);

  // If the window has expired, reset the tracker for this IP
  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + WINDOW_MS;
    return next();
  }

  // Increment and check if it exceeds the max allowed limit
  clientData.count++;
  if (clientData.count > MAX_REQUESTS) {
    res.setHeader('Retry-After', Math.ceil((clientData.resetTime - now) / 1000));
	res.writeHead(429)
    return res.end(JSON.stringify({ 
      error: 'Too Many Requests', 
      message: 'You have exceeded your request limit. Please try again later.' 
    })); // 429 Status Code
  }

  next();
}

// Memory cleanup interval to prevent leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestTracker.entries()) {
    if (now > data.resetTime) {
      requestTracker.delete(ip);
    }
  }
}, WINDOW_MS);








// globalRateLimiter.js
let globalRequestCount = 0;
let windowStart = Date.now();

function nativeGlobalLimiter(req, res, next) {
  const WINDOW_MS = 60 * 1000; // 1 minute window
  const MAX_REQUESTS = 10000;   // Max requests allowed globally per window	
  const now = Date.now();

  // Reset the window if the time interval has passed
  if (now - windowStart > WINDOW_MS) {
    globalRequestCount = 0;
    windowStart = now;
  }

  // Check if global threshold is exceeded
  if (globalRequestCount >= MAX_REQUESTS) {
	res.setHeader('Retry-After', Math.ceil((windowStart + WINDOW_MS - now) / 1000));
    res.writeHead(429);
    return res.end(JSON.stringify({ error: 'Global rate limit exceeded. Try again later.' }));
  }

  globalRequestCount++;
  next();
}





function router(req, res, next) {
	
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <body>
                <h2>Welcome</h2>
            </body>
            </html>
        `);
		return;
    } 	
	
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Route not found' }));
}



function compose(middlewares) {
  return async (req, res) => {
    let index = 0;
    
    async function next() {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        await middleware(req, res, next);
      }
    }
    
    await next();
  };
}

// Usage
const app = compose([
  nativeGlobalLimiter,
  nativeRateLimiter,
  router,
]);




const server = http.createServer(async (req, res) => {
	
	await app(req, res)
	

});

// Start listening on port 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running smoothly on http://localhost:${PORT}`);
});

// rateLimiter.js
const requestTracker = new Map();

// Configuration
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS = 100;    // Limit each IP to 100 requests per window

export function nativeRateLimiter(req, res, next) {
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
    return res.status(429).json({ 
      error: 'Too Many Requests', 
      message: 'You have exceeded your request limit. Please try again later.' 
    }); // 429 Status Code
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

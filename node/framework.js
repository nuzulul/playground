//https://medium.com/engineering-playbook/i-built-a-startup-with-no-backend-framework-just-vanilla-node-js-heres-why-10700c547f1c

const http = require('http');

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});
server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});



function handleRequest(req, res) {
  const { method, url } = req;
  const key = `${method} ${url.split('?')[0]}`;
  
  // Exact match
  if (routes[key]) {
    return routes[key](req, res);
  }
  
  // Pattern match (for :id routes)
  for (const [pattern, handler] of Object.entries(routes)) {
    const regex = pattern.replace(/:(\w+)/g, '(?<$1>\\w+)');
    const match = key.match(new RegExp(`^${regex}$`));
    
    if (match) {
      req.params = match.groups;
      return handler(req, res);
    }
  }
  
  // Not found
  res.writeHead(404);
  res.end('Not Found');
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
  //loggerMiddleware,
  //authMiddleware,
  //corsMiddleware,
  //yourRouteHandler
]);

function enhanceRequest(req) {
  // Parse query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  req.query = Object.fromEntries(url.searchParams);
  
  // Parse body (async)
  req.json = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(JSON.parse(body)));
  });
}


function enhanceResponse(res) {
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  
  res.status = (code) => {
    res.statusCode = code;
    return res; // Chainable
  };
}

const handleHome = (req, res)=>{
        res.writeHead(200);
        res.end('hello world');
}

const routes = {
  'GET /': handleHome,
  //'GET /users': getUsers,
  //'POST /users': createUser,
  //'GET /users/:id': getUser,
  //'PUT /users/:id': updateUser,
  //'DELETE /users/:id': deleteUser,
};
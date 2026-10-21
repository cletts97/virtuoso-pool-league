import { createServer } from 'node:http';
import { handleApi } from './runtime';
createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > (req.url?.split('?')[0] === '/api/profile/photo' ? 360000 : 65536)) {
      res.writeHead(413);
      res.end();
      return;
    }
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers))
    if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
  const response = await handleApi(
    new Request(`http://127.0.0.1:7071${req.url}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' ? undefined : body,
    }),
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(7071, '127.0.0.1', () =>
  console.log('Local API listening on http://127.0.0.1:7071 (same handlers as Azure Functions)'),
);

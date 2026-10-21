import { app } from '@azure/functions';
import { handleApi } from './runtime';
app.http('league', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: '{*path}',
  handler: async (request) => {
    // Function access is anonymous because Supabase bearer validation happens inside every protected route.
    const body = request.method === 'GET' ? undefined : await request.text();
    const response = await handleApi(
      new Request(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body,
      }),
    );
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    };
  },
});

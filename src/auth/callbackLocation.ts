/** Route Auth payloads before creating the SDK client, which consumes URL fragments. */
export function callbackLocation(location: {
  pathname: string;
  search: string;
  hash: string;
}): string | undefined {
  if (location.pathname === '/auth/callback') return;
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const passwordFlow = (params: URLSearchParams) =>
    ['invite', 'recovery'].includes(params.get('type') ?? '');
  if (
    (passwordFlow(query) && query.has('token_hash')) ||
    (passwordFlow(fragment) && fragment.has('access_token')) ||
    fragment.has('error_description')
  )
    return `/auth/callback${location.search}${location.hash}`;
}

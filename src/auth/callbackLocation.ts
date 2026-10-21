/** Route Auth payloads before creating the SDK client, which consumes URL fragments. */
export function callbackLocation(location: {
  pathname: string;
  search: string;
  hash: string;
}): string | undefined {
  if (['/auth/callback', '/auth/accept-invite'].includes(location.pathname)) return;
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const passwordFlow = (params: URLSearchParams) =>
    ['invite', 'recovery'].includes(params.get('type') ?? '');
  if (
    (passwordFlow(query) && query.has('token_hash')) ||
    (passwordFlow(fragment) && fragment.has('access_token')) ||
    fragment.has('error_description')
  )
    return `/auth/${query.get('type') === 'invite' || fragment.get('type') === 'invite' ? 'accept-invite' : 'callback'}${location.search}${location.hash}`;
}

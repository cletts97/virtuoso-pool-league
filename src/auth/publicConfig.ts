/** Accept only the public key formats. Also used by Vite before emitting a browser bundle. */
export function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  try {
    const payload: unknown = JSON.parse(
      atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return !!payload && typeof payload === 'object' && 'role' in payload && payload.role === 'anon';
  } catch {
    return false;
  }
}

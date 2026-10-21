import { Pool } from 'pg';
import type { ApiConfig } from './config';
export function createPool(config: ApiConfig): Pool {
  const url = new URL(config.databaseUrl);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  // pg connection-string TLS options can override the explicit verified-TLS configuration.
  for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  return new Pool({
    connectionString: url.toString(),
    max: 4,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 20000,
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(config.databaseCa ? { ca: config.databaseCa.replace(/\\n/g, '\n') } : {}),
        },
  });
}

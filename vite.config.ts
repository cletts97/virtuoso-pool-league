import { pwaPlugin } from './scripts/pwa-plugin.ts';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { isPublicSupabaseKey } from './src/auth/publicConfig.ts';
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY && !isPublicSupabaseKey(env.VITE_SUPABASE_PUBLISHABLE_KEY))
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a public publishable/anon key.');
  if (env.VITE_DATA_MODE && !['api', 'mock'].includes(env.VITE_DATA_MODE))
    throw new Error('VITE_DATA_MODE must be api or mock.');
  if (
    env.VITE_DATA_MODE === 'api' &&
    (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY)
  )
    throw new Error('Live mode requires the public Supabase URL and publishable key.');
  return {
    plugins: [
      react(),
      pwaPlugin(),
      tailwindcss(),
      legacy({
        // webOS 4.x uses Chromium 53. This targets JavaScript, not CSS support.
        targets: ['chrome >= 53'],
        modernPolyfills: false,
      }),
    ],
    optimizeDeps: { entries: ['index.html'] },
    server: {
      proxy: { '/api': 'http://127.0.0.1:7071' },
      watch: { ignored: ['**/.tools/**', '**/test-results/**', '**/playwright-report/**'] },
    },
    test: { include: ['src/**/*.test.ts', 'api/tests/**/*.test.ts'] },
  };
});

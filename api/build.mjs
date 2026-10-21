import { build } from 'esbuild';
await build({
  entryPoints: ['src/functions.ts', 'src/dev.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
  packages: 'external',
  sourcemap: true,
});

import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
// Build first. Copy only reviewed runtime files; never .env, tests or local settings.
const api = JSON.parse(await readFile('api/package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
if (Object.keys(lock.packages).some((path) => path.startsWith('api/node_modules/')))
  throw new Error('Nested API dependencies need explicit packaging support.');
const manifest = {
  name: api.name,
  version: api.version,
  private: true,
  main: api.main,
  engines: { node: '22.x' },
  dependencies: Object.fromEntries(
    Object.keys(api.dependencies).map((name) => {
      const version = lock.packages[`node_modules/${name}`]?.version;
      if (!version) throw new Error(`Missing locked API dependency: ${name}`);
      return [name, version];
    }),
  ),
};
const packages = Object.fromEntries(
  Object.entries(lock.packages).filter(
    ([path, value]) => path.startsWith('node_modules/') && !value.link,
  ),
);
packages[''] = manifest;
const output = '.tools/azure-api';
await mkdir(`${output}/dist`, { recursive: true });
await copyFile('api/dist/functions.cjs', `${output}/dist/functions.cjs`);
await copyFile('api/host.json', `${output}/host.json`);
await writeFile(`${output}/package.json`, JSON.stringify(manifest, null, 2));
await writeFile(
  `${output}/package-lock.json`,
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      lockfileVersion: 3,
      requires: true,
      packages,
    },
    null,
    2,
  ),
);
console.log(
  `Prepared ${output}. Install locked runtime dependencies with npm ci --omit=dev --prefix ${output} --workspaces=false before upload.`,
);

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Build-only worker: caches code/assets, never documents or application responses. */
export function pwaPlugin(): Plugin {
  let directory = '';
  return {
    name: 'virtuoso-pwa',
    apply: 'build',
    configResolved(config) {
      directory = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = (path: string): string[] =>
        readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory() ? files(resolve(path, entry.name)) : [resolve(path, entry.name)],
        );
      const assets = files(resolve(directory, 'assets'))
        .filter((path) => /\.(js|css|woff2?|png|svg)$/.test(path))
        .map((path) => '/' + relative(directory, path).split(sep).join('/'))
        .sort();
      const offline = [
        '/offline.html',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/apple-touch-icon.png',
      ];
      const digest = createHash('sha256');
      for (const path of [...assets, ...offline, '/index.html'])
        digest.update(readFileSync(resolve(directory, '.' + path)));
      // Include worker logic in the version, so policy-only updates also invalidate old caches.
      const worker = `
var CACHE = '__CACHE__';
var OFFLINE = ${JSON.stringify(offline)};
var ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', function(event) {
  event.waitUntil(caches.open(CACHE).then(function(cache) {
    return cache.addAll(OFFLINE.map(function(url) { return new Request(url, {cache:'reload'}); }));
  }));
});
self.addEventListener('activate', function(event) {
  event.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(key) { return key.indexOf('vpl-static-') === 0 && key !== CACHE; }).map(function(key) { return caches.delete(key); }));
  }).then(function() { return self.clients.claim(); }));
});
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'VPL_ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.indexOf('/api/') === 0 || url.pathname === '/display') return;
  if (request.mode === 'navigate') {
    // Auth links, documents and their query parameters are always network-only.
    event.respondWith(fetch(request, {cache:'no-store'}).catch(function() {
      return caches.open(CACHE).then(function(cache) { return cache.match('/offline.html'); });
    }));
    return;
  }
  if (url.search || ASSETS.indexOf(url.pathname) === -1) return;
  event.respondWith(caches.open(CACHE).then(function(cache) {
    return cache.match(request).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(response) {
        if (response.ok && response.type === 'basic') event.waitUntil(cache.put(request, response.clone()));
        return response;
      });
    });
  }));
});
`;
      digest.update(worker);
      writeFileSync(
        resolve(directory, 'sw.js'),
        worker.replace('__CACHE__', 'vpl-static-' + digest.digest('hex').slice(0, 16)),
      );
    },
  };
}

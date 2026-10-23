# Installable mobile app

Virtuoso Pool League is an installable progressive web app (PWA), using the existing website and backend. No app-store subscription, native application, database migration or additional environment variable is required.

## Installing

Choose **Install app** beside the theme button in the mobile header (up to 600px wide). The control is hidden on larger layouts and inside the installed app. The TV display has no installation controls and does not register a service worker. Supported desktop browsers can still install through their own browser menu.

- **Android / supported desktop browsers:** the button opens the browser's native installation prompt when available. Otherwise it shows instructions for the browser's Install app / Add to Home screen menu.
- **iPhone / iPad:** the button shows instructions: open the site in Safari, choose Share → Add to Home Screen, keep Open as Web App enabled if shown, then Add. The icon launches a standalone web app, rather than an ordinary browser bookmark. iOS does not provide the same programmatic installation prompt as Chromium. A separate sign-in may be needed after installation.

Installation requires HTTPS (localhost is allowed for development). Email invitations and password-reset links retain their existing routes; installation is not required to use them. Installing does not enable push notifications. Email and existing in-app notifications are unchanged.

## Offline access, privacy and updates

An internet connection is required for shared data, authentication and all edits. Offline launches show a small reconnect page, not a cached copy of private league data. An already open app shows a connection warning; API-backed actions reject while the browser reports offline. No offline edits are queued.

The build-generated `/sw.js` precaches only the public reconnect page and app icons. It may cache exact versioned JS/CSS/font/image assets from that build. It never caches API responses, documents, invitation/reset URLs or query-string requests. Supabase's existing authentication-session storage remains unchanged; the service worker adds no account-data cache. Old worker caches are removed when a new worker activates.

Updates wait for explicit confirmation through **Update app** so an open form is not automatically interrupted. Finish any edits before accepting. Only the tab accepting the update reloads. Returning to a tab checks for updates at most once per 15 minutes. Ordinary Vite development does not register a worker; the existing legacy TV/browser path remains online-only.

## Build and deployment

Run `npm run build` and deploy the existing frontend artifact through the normal GitHub Actions workflow. The build emits `sw.js`; Vite copies the manifest, icons, reconnect page and Static Web Apps configuration. Existing API deployment and environment settings are unchanged.

`public/staticwebapp.config.json` excludes these files from SPA fallback and prevents caching the worker. Keep those routes/headers when changing deployment configuration. Do not merely remove `sw.js` to roll back PWA support: existing registrations persist and would need a replacement cleanup worker at that URL.

Icons reuse the existing eight-ball favicon with an opaque background; the company wordmark is unchanged. Regenerate them locally with `node scripts/generate-app-icons.mjs` (requires the project's existing Playwright and installed Chrome).

## Validation

`npm run test:pwa` builds an isolated mock production artifact under `.tools/pwa-dist` and runs six focused browser tests. It does not overwrite normal deployment output, read cloud credentials or contact the backend. Coverage includes manifest/icons/headers, install prompts, iPhone instructions, offline fallback, private-response exclusions, consent-driven updates and standalone/TV behavior.

After deployment, check actual iPhone Safari and Android installation, standalone login, invitation/password-reset links, reconnect behavior and an update. Automated iPhone coverage uses Chromium with an iPhone user agent; it is not physical iOS/Safari testing.

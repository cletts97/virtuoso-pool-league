interface InstallEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface PwaState {
  installed: boolean;
  offline: boolean;
  updateReady: boolean;
  canPrompt: boolean;
}
let state: PwaState = { installed: false, offline: false, updateReady: false, canPrompt: false };
const listeners = new Set<() => void>();
let installEvent: InstallEvent | undefined;
let registration: ServiceWorkerRegistration | undefined;
let started = false;
let requestedUpdate = false;

export function excludedPwaBrowser(agent: string) {
  const chrome = agent.match(/Chrom(?:e|ium)\/(\d+)/);
  return (
    /web0s|webos|netcast|smart[- ]?tv|hbbtv/i.test(agent) || (!!chrome && Number(chrome[1]) < 70)
  );
}
export function isIosDevice(agent = navigator.userAgent, touchPoints = navigator.maxTouchPoints) {
  return /iphone|ipad|ipod/i.test(agent) || (/macintosh/i.test(agent) && touchPoints > 1);
}
const patch = (value: Partial<PwaState>) => {
  state = { ...state, ...value };
  listeners.forEach((listener) => listener());
};
export const subscribePwa = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getPwaState = () => state;

/** Development stays worker-free. Older TVs retain the existing online application. */
export function startPwa() {
  if (started || excludedPwaBrowser(navigator.userAgent) || location.pathname === '/display')
    return;
  started = true;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installed = () =>
    standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
  patch({ installed: installed(), offline: !navigator.onLine });
  standalone.addEventListener?.('change', () => patch({ installed: installed() }));
  window.addEventListener('online', () => patch({ offline: false }));
  window.addEventListener('offline', () => patch({ offline: true }));
  window.addEventListener('beforeinstallprompt', (event) => {
    if (isIosDevice()) return;
    event.preventDefault();
    installEvent = event as InstallEvent;
    patch({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    installEvent = undefined;
    patch({ installed: true, canPrompt: false });
  });
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Never interrupt a form, another open tab or an invitation/password flow.
    if (requestedUpdate) window.location.reload();
  });
  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      const inspect = () =>
        patch({ updateReady: !!registration?.waiting && !!navigator.serviceWorker.controller });
      inspect();
      registration.addEventListener('updatefound', () =>
        registration?.installing?.addEventListener('statechange', inspect),
      );
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && navigator.onLine && Date.now() - lastCheck > 15 * 60 * 1000) {
          lastCheck = Date.now();
          void registration?.update().catch(() => {});
        }
      });
    } catch {
      /* Installation must never prevent normal online access. */
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
export async function promptPwaInstall() {
  const event = installEvent;
  if (!event) return;
  installEvent = undefined;
  patch({ canPrompt: false });
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === 'accepted') patch({ installed: true });
}
export function activatePwaUpdate() {
  if (!registration?.waiting) return;
  requestedUpdate = true;
  registration.waiting.postMessage({ type: 'VPL_ACTIVATE_UPDATE' });
}

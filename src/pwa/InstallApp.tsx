import { useState, useSyncExternalStore } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { Modal } from '../components/ui';
import {
  excludedPwaBrowser,
  getPwaState,
  isIosDevice,
  promptPwaInstall,
  subscribePwa,
} from './client';

export function InstallApp() {
  const pwa = useSyncExternalStore(subscribePwa, getPwaState);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  if (pwa.installed || excludedPwaBrowser(navigator.userAgent)) return null;
  const ios = isIosDevice();
  async function install() {
    setError('');
    if (!pwa.canPrompt) {
      setOpen(true);
      return;
    }
    try {
      await promptPwaInstall();
    } catch {
      setError('Installation could not start. Use your browser’s install menu instead.');
      setOpen(true);
    }
  }
  return (
    <>
      <button className="button secondary small pwa-install-button" onClick={() => void install()}>
        <Download size={16} aria-hidden="true" />
        Install app
      </button>
      {open && (
        <Modal title="Install Virtuoso Pool League" onClose={() => setOpen(false)}>
          <div className="form-stack pwa-install-content">
            <p>
              Add the app to your home screen for quick access to bookings, fixtures and results.
            </p>
            <div className="pwa-install-heading">
              <Smartphone size={22} aria-hidden="true" />
              <strong>
                {ios
                  ? 'On iPhone or iPad'
                  : /android/i.test(navigator.userAgent)
                    ? 'On Android'
                    : 'In your browser'}
              </strong>
            </div>
            {ios ? (
              <ol className="pwa-instructions">
                <li>Open this website in Safari.</li>
                <li>
                  Tap <Share size={15} aria-hidden="true" /> <strong>Share</strong> in the toolbar
                  or page menu.
                </li>
                <li>
                  Choose <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  If shown, leave <strong>Open as Web App</strong> enabled, then tap{' '}
                  <strong>Add</strong>.
                </li>
              </ol>
            ) : (
              <p>
                Open your browser’s menu and choose <strong>Install app</strong> or{' '}
                <strong>Add to Home screen</strong>. Some desktop browsers show an install icon in
                the address bar. If no install option is available, you can keep using the website
                normally.
              </p>
            )}
            <p className="field-help">
              The home-screen icon opens the app in its own window. You still need an internet
              connection to view current data, sign in, book the table or save results. No App Store
              or Google Play download is needed.
            </p>
            <p className="field-help">
              Installing does not enable phone push notifications. Existing email and in-app
              notifications continue to work.
            </p>
            {error && <p role="alert">{error}</p>}
            <button className="button primary" onClick={() => setOpen(false)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

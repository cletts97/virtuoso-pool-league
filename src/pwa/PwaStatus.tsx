import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, WifiOff } from 'lucide-react';
import { activatePwaUpdate, getPwaState, subscribePwa } from './client';

export function PwaStatus() {
  const pwa = useSyncExternalStore(subscribePwa, getPwaState);
  const location = useLocation();
  if (location.pathname === '/display' || (!pwa.offline && !pwa.updateReady)) return null;
  return (
    <aside className="pwa-status" role="status">
      {pwa.offline ? (
        <>
          <WifiOff size={20} aria-hidden="true" />
          <div>
            <strong>You’re offline</strong>
            <p>
              Reconnect before booking or saving results. Shared information may be out of date.
            </p>
          </div>
        </>
      ) : (
        <>
          <RefreshCw size={20} aria-hidden="true" />
          <div>
            <strong>An app update is available</strong>
            <p>Finish any edits before updating. Other open tabs won’t reload automatically.</p>
            <button className="button primary small" onClick={activatePwaUpdate}>
              Update app
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

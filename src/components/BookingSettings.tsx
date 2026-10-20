import { useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { Modal } from './ui';

export function BookingSettings({ onClose }: { onClose(): void }) {
  const { state, run, busy } = useLeague();
  const [config, setConfig] = useState(structuredClone(state.bookingConfig));
  return (
    <Modal title="Table opening hours" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run({ type: 'bookingConfig', config }, 'Table opening hours updated.').then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <p className="field-help">
          Europe/London · Existing future reservations must remain within the new hours.
        </p>
        <div className="form-grid">
          <label>
            Opens at
            <input
              required
              type="time"
              step="900"
              value={config.opensAt}
              onChange={(e) => setConfig({ ...config, opensAt: e.target.value })}
            />
          </label>
          <label>
            Closes at
            <input
              required
              type="time"
              step="900"
              value={config.closesAt}
              onChange={(e) => setConfig({ ...config, closesAt: e.target.value })}
            />
          </label>
        </div>
        <fieldset className="booking-guests">
          <legend>Opening days</legend>
          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
            (name, day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={config.weekdays.includes(day)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      weekdays: e.target.checked
                        ? [...config.weekdays, day].sort()
                        : config.weekdays.filter((d) => d !== day),
                    })
                  }
                />
                {name}
              </label>
            ),
          )}
        </fieldset>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            Save opening hours
          </button>
        </div>
      </form>
    </Modal>
  );
}

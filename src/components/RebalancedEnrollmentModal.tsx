import { useMemo, useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { planRebalancedEnrollment } from '../domain/rebalancedEnrollment';
import { weekLabel, weekStart } from '../domain/rules';
import { Modal } from './ui';

export function RebalancedEnrollmentModal({
  seasonId,
  onClose,
}: {
  seasonId: string;
  onClose(): void;
}) {
  const { state, run, busy } = useLeague();
  const requests = (state.joinRequests ?? []).filter(
    (r) => r.seasonId === seasonId && r.status === 'pending',
  );
  const [selected, setSelected] = useState(() =>
    requests
      .filter((r) => state.players.some((p) => p.id === r.playerId && p.active))
      .map((r) => r.id),
  );
  const [confirmed, setConfirmed] = useState(false);
  const preview = useMemo(() => {
    try {
      return { plan: planRebalancedEnrollment(state, seasonId, selected), error: '' };
    } catch (error) {
      return { plan: undefined, error: (error as Error).message };
    }
  }, [state, seasonId, selected]);
  const plan = preview.plan;
  const season = state.seasons.find((s) => s.id === seasonId)!;
  const entries = [
    ...state.participants.filter((p) => season.participantIds.includes(p.id)),
    ...(plan?.entries ?? []),
  ];
  const fixtureName = (id: string) => entries.find((p) => p.id === id)?.name ?? 'Player';
  const assigned = (id: string, week?: string) =>
    plan?.fixtures.filter(
      (f) =>
        f.status !== 'cancelled' &&
        (!week || weekStart(f.dueDate) === week) &&
        [f.homeId, f.awayId].includes(id),
    ).length ?? 0;
  const table = (newOnly: boolean) => (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={
        newOnly
          ? 'Joining players weekly counts, scroll horizontally'
          : 'All players weekly counts, scroll horizontally'
      }
    >
      <table className="schedule-preview-table">
        <caption className="sr-only">
          Assigned fixtures per week{newOnly ? ' for joining players' : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            {plan?.weeks.map((week) => (
              <th key={week} scope="col">
                {new Date(`${week}T12:00:00Z`).toLocaleDateString('en-GB', {
                  timeZone: 'UTC',
                  day: 'numeric',
                  month: 'short',
                })}
              </th>
            ))}
            <th scope="col">Season total</th>
          </tr>
        </thead>
        <tbody>
          {(newOnly ? (plan?.entries ?? []) : entries).map((p) => (
            <tr
              key={p.id}
              className={plan?.entries.some((e) => e.id === p.id) ? 'joining-row' : ''}
            >
              <th scope="row">{p.name}</th>
              {plan?.weeks.map((week) => (
                <td key={week}>{assigned(p.id, week) || '—'}</td>
              ))}
              <td>{assigned(p.id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  async function apply() {
    if (!plan || !confirmed) return;
    if (
      await run(
        {
          type: 'acceptJoinRequestsAndRebalance',
          seasonId,
          requestIds: selected,
          previewKey: plan.previewKey,
        },
        'Players accepted and future fixture weeks updated.',
      )
    )
      onClose();
  }
  return (
    <Modal
      title="Joiners & revised weekly schedule"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="form-stack">
        <p>
          Select the requests to approve together for <strong>{season.name}</strong>.
        </p>
        <fieldset disabled={busy} className="rebalance-request-picker">
          <legend>Players to accept</legend>
          {requests.map((r) => {
            const p = state.players.find((p) => p.id === r.playerId);
            return (
              <label key={r.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  disabled={!p?.active}
                  onChange={(event) => {
                    setConfirmed(false);
                    setSelected((ids) =>
                      event.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id),
                    );
                  }}
                />
                {p?.name ?? 'Former account'}
                {!p?.active ? ' (inactive)' : ''}
              </label>
            );
          })}
        </fieldset>
        {preview.error && <p role="alert">{preview.error}</p>}
        {plan && (
          <>
            <p>
              <strong>
                {plan.additions.length} new fixtures · {plan.moved.length} existing fixtures change
                week
              </strong>
            </p>
            <p className="field-help">
              Existing fixtures this week and earlier, any submitted result (including
              pending/disputed scores), and fixtures with reserved bookings stay fixed. Only
              unplayed, unsubmitted, unbooked future fixtures can move. New pairings may use spare
              places this week.
            </p>
            <p>
              League ends: <strong>{weekLabel(plan.lastWeek)}</strong>
              {plan.lastWeek > plan.oldLastWeek ? ' (extended)' : ''}.<br />
              Projected playoffs: <strong>{weekLabel(plan.playoffWeek)}</strong>.
            </p>
            <h3>Joining players: weekly fixtures</h3>
            {table(true)}
            <p className="field-help">
              Columns are weeks commencing Monday. Aim: two assigned matches per player each week,
              with ordinary byes when needed. No special catch-up week. Season totals include
              earlier weeks; actual completed matches can differ.
            </p>
            <details>
              <summary>View weekly totals for everyone</summary>
              {table(false)}
            </details>
            <details>
              <summary>View fixture week changes ({plan.moved.length})</summary>
              <div className="rebalance-changes">
                {plan.moved.map((change) => {
                  const f = state.fixtures.find((f) => f.id === change.id)!;
                  return (
                    <p key={f.id}>
                      <strong>
                        {fixtureName(f.homeId)} v {fixtureName(f.awayId)}
                      </strong>
                      <br />
                      {weekLabel(change.from)} → {weekLabel(change.to)}
                    </p>
                  );
                })}
                {!plan.moved.length && <p>No existing fixtures need to move.</p>}
              </div>
            </details>
            <label className="checkbox-label rebalance-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I have reviewed the schedule. Update future weeks and notify affected players.
            </label>
          </>
        )}
        <div className="form-actions">
          <button className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !plan || !confirmed}
            onClick={() => void apply()}
          >
            {busy
              ? 'Updating…'
              : `Accept ${selected.length} ${selected.length === 1 ? 'player' : 'players'} and update schedule`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

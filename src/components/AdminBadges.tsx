import { useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { BADGES } from '../domain/badges';
import type { BadgeKey, Player } from '../domain/types';
import { Modal } from './ui';
import { BadgeArt } from './Achievements';

export function AdminBadges({ player, onClose }: { player: Player; onClose(): void }) {
  const { state, run, busy } = useLeague();
  const [badgeKey, setBadgeKey] = useState<BadgeKey>('seven_ball');
  const [seasonId, setSeasonId] = useState(
    state.seasons.find((s) => s.status !== 'draft')?.id ?? '',
  );
  const [reason, setReason] = useState('');
  const [revoking, setRevoking] = useState<string>();
  const [revokeReason, setRevokeReason] = useState('');
  const awards = (state.badgeAwards ?? []).filter((a) => a.playerId === player.id);
  return (
    <Modal title={`Badges · ${player.name}`} onClose={onClose}>
      <div className="form-stack">
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run(
                {
                  type: 'grantBadge',
                  playerId: player.id,
                  badgeKey,
                  seasonId: BADGES[badgeKey].season ? seasonId : undefined,
                  reason,
                },
                'Badge granted.',
              )
            )
              setReason('');
          }}
        >
          <label>
            Badge
            <select value={badgeKey} onChange={(e) => setBadgeKey(e.target.value as BadgeKey)}>
              {Object.entries(BADGES).map(([key, d]) => (
                <option key={key} value={key}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="achievement-preview">
            <BadgeArt badgeKey={badgeKey} />
            <p>{BADGES[badgeKey].description}</p>
          </div>
          {BADGES[badgeKey].season && (
            <label>
              Season
              <select required value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
                <option value="">Choose a season</option>
                {state.seasons
                  .filter((s) => s.status !== 'draft')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Reason (optional)
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </label>
          <p className="field-help">
            Administrator grants take effect immediately and are recorded in the badge history.
          </p>
          <button className="button primary" disabled={busy || !player.active}>
            Grant badge
          </button>
        </form>
        <h3>Badge history</h3>
        {!awards.length && <p>No badges yet.</p>}
        {awards.map((a) => (
          <div className="achievement-admin-row" key={a.id}>
            <BadgeArt badgeKey={a.badgeKey} small />
            <div>
              <strong>{BADGES[a.badgeKey].name}</strong>
              <small>
                {a.seasonId ? state.seasons.find((s) => s.id === a.seasonId)?.name + ' · ' : ''}
                {a.status} · {a.source}
              </small>
              <details>
                <summary>View history</summary>
                <ul>
                  {a.history.map((h, i) => (
                    <li key={i}>
                      {new Date(h.at).toLocaleString('en-GB')} · {h.action} ·{' '}
                      {h.actorId
                        ? (state.players.find((p) => p.id === h.actorId)?.name ?? 'Former account')
                        : 'System'}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
            {['pending', 'confirmed'].includes(a.status) && (
              <button
                type="button"
                className="button secondary small"
                disabled={busy}
                onClick={() => {
                  setRevoking(a.id);
                  setRevokeReason('');
                }}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
        {revoking && (
          <form
            className="form-stack achievement-revoke"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  { type: 'revokeBadge', id: revoking, reason: revokeReason },
                  'Badge revoked.',
                )
              )
                setRevoking(undefined);
            }}
          >
            <strong>Revoke this badge?</strong>
            <label>
              Reason
              <input
                required
                maxLength={300}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setRevoking(undefined)}
              >
                No, keep badge
              </button>
              <button className="button danger" disabled={busy}>
                Yes, revoke badge
              </button>
            </div>
          </form>
        )}
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

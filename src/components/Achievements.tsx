import { Link } from 'react-router-dom';
import { useLeague } from '../app/LeagueContext';
import { BADGES, PLAYING_BADGES, canReviewBadge, earnedBadges } from '../domain/badges';
import type { BadgeClaimInput, BadgeKey, Player, PublicBadge } from '../domain/types';
import { Section } from './ui';
import '../badges.css';

export function BadgeArt({ badgeKey, small = false }: { badgeKey: BadgeKey; small?: boolean }) {
  return (
    <img
      className={small ? 'achievement-art small' : 'achievement-art'}
      src={`/badges/${badgeKey}.svg`}
      alt=""
      aria-hidden="true"
      width={small ? 22 : 72}
      height={small ? 24 : 78}
    />
  );
}
export function BadgeStrip({ awards }: { awards: PublicBadge[] }) {
  const keys = [...new Set(awards.map((a) => a.badgeKey))];
  if (!keys.length) return null;
  return (
    <span className="achievement-strip" aria-label="Achievements">
      {keys.map((key) => (
        <span
          key={key}
          title={`${BADGES[key].name} · ${awards.filter((a) => a.badgeKey === key).length}`}
        >
          <BadgeArt badgeKey={key} small />
          <span className="sr-only">{BADGES[key].name}</span>
        </span>
      ))}
    </span>
  );
}
export function PlayerAchievements({ playerId }: { playerId: string }) {
  const { state } = useLeague();
  if (state.badgesEnabled === false) return null;
  const awards = earnedBadges(state, playerId);
  const groups = new Map<string, PublicBadge[]>();
  for (const a of awards) {
    const key = BADGES[a.badgeKey].season ? `${a.badgeKey}/${a.seasonId}` : a.badgeKey;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return (
    <Section
      title="Achievements"
      subtitle="Season awards and opponent-confirmed playing achievements."
    >
      {!awards.length ? (
        <p className="panel-footnote">No badges earned yet.</p>
      ) : (
        <div className="achievement-gallery">
          {[...groups].map(([key, items]) => {
            const a = items[0],
              definition = BADGES[a.badgeKey];
            return (
              <details
                className={`achievement-card ${a.badgeKey === 'season_champion' ? 'champion' : ''}`}
                key={key}
              >
                <summary>
                  <BadgeArt badgeKey={a.badgeKey} />
                  <strong>
                    {definition.name}
                    {items.length > 1 ? ` ×${items.length}` : ''}
                  </strong>
                  {definition.season && (
                    <span>
                      {state.seasons.find((s) => s.id === a.seasonId)?.name ?? 'Season award'}
                    </span>
                  )}
                  <small>View achievement</small>
                </summary>
                <p>{definition.description}</p>
                <ul>
                  {items.map((item) => (
                    <li key={item.id}>
                      {item.fixtureId || item.casualResultId ? (
                        <Link
                          className="text-link"
                          to={
                            item.fixtureId
                              ? `/fixtures/${item.fixtureId}`
                              : `/casual?result=${item.casualResultId}`
                          }
                        >
                          View match
                        </Link>
                      ) : (
                        <span>Season or administrator award</span>
                      )}{' '}
                      · {new Date(item.createdAt).toLocaleDateString('en-GB')}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </Section>
  );
}
export function BadgeClaimPicker({
  players,
  value,
  onChange,
}: {
  players: Player[];
  value: BadgeClaimInput[];
  onChange(value: BadgeClaimInput[]): void;
}) {
  const { state, busy } = useLeague();
  if (state.badgesEnabled === false) return null;
  return (
    <details className="achievement-picker">
      <summary>Claim a special achievement (optional)</summary>
      <p className="field-help">
        Only claim achievements that happened in a frame of this match. An opposing player must
        confirm each one separately. Automatic score confirmation does not award badges.
      </p>
      {PLAYING_BADGES.map((key) => (
        <fieldset key={key} disabled={busy}>
          <legend>
            <BadgeArt badgeKey={key} small /> {BADGES[key].name}
          </legend>
          <p className="field-help">{BADGES[key].description}</p>
          {players.map((p) => (
            <label key={p.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={value.some((c) => c.badgeKey === key && c.playerId === p.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, { badgeKey: key, playerId: p.id }]
                      : value.filter((c) => c.badgeKey !== key || c.playerId !== p.id),
                  )
                }
              />
              {p.name}
            </label>
          ))}
        </fieldset>
      ))}
    </details>
  );
}
export function MatchAchievements({
  fixtureId,
  casualResultId,
}: {
  fixtureId?: string;
  casualResultId?: string;
}) {
  const { state, run, busy } = useLeague();
  const awards = (state.badgeAwards ?? []).filter((a) =>
    fixtureId ? a.fixtureId === fixtureId : a.casualResultId === casualResultId,
  );
  if (!awards.length) return null;
  return (
    <div className="match-achievements">
      <h3>Match achievements</h3>
      <p className="field-help">
        Confirm the achievement only if you saw it happen. Score approval is separate.
      </p>
      {awards.map((a) => (
        <div key={a.id} className="achievement-review">
          <BadgeArt badgeKey={a.badgeKey} small />
          <div>
            <strong>
              {BADGES[a.badgeKey].name} · {state.players.find((p) => p.id === a.playerId)?.name}
            </strong>
            <p className="field-help">{BADGES[a.badgeKey].description}</p>
            <small>
              {a.status === 'confirmed'
                ? earnedBadges(state).some((b) => b.id === a.id)
                  ? 'Earned'
                  : 'Opponent confirmed · awaiting score confirmation'
                : a.status === 'pending'
                  ? 'Awaiting opponent confirmation'
                  : a.status === 'revoked'
                    ? 'Revoked'
                    : 'Declined'}
            </small>
          </div>
          {canReviewBadge(state, a) && (
            <div className="achievement-actions">
              <button
                type="button"
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  void run(
                    { type: 'reviewBadge', id: a.id, approve: true },
                    'Achievement confirmed.',
                  )
                }
              >
                Confirm achievement
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  void run(
                    { type: 'reviewBadge', id: a.id, approve: false },
                    'Achievement declined.',
                  )
                }
              >
                Decline
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

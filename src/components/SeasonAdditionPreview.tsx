import { useLeague } from '../app/LeagueContext';
import type { Season } from '../domain/types';
import { planAdditionalFixtures } from '../domain/lateEntry';
import { addDays, participantName, playoffWeek, weekLabel } from '../domain/rules';

export function SeasonAdditionPreview({
  season,
  firstWeek,
}: {
  season: Season;
  firstWeek: string;
}) {
  const { state } = useLeague();
  if (season.status === 'draft' || !firstWeek) return null;
  const plan = planAdditionalFixtures(season, state.fixtures, firstWeek);
  const weeks = [...new Set(plan.map((f) => f.dueDate))];
  const playoffs = [playoffWeek(season, state.fixtures), addDays(weeks.at(-1) ?? firstWeek, 7)]
    .sort()
    .at(-1)!;
  return (
    <div className="field-help">
      <p>
        Adds {plan.length} matches in spare weekly places, with no more than two league matches per
        player per week. Existing fixtures and results stay unchanged. Extra weeks are added if
        needed.
      </p>
      <details>
        <summary>View the new player's schedule</summary>
        <ul>
          {weeks.map((week) => (
            <li key={week}>
              <strong>{weekLabel(week)}</strong>:{' '}
              {plan
                .filter((f) => f.dueDate === week)
                .map((f) => participantName(state, f.opponentId))
                .join(', ')}
            </li>
          ))}
        </ul>
      </details>
      <p>Projected playoffs: {weekLabel(playoffs)}. Players can still arrange to play early.</p>
    </div>
  );
}

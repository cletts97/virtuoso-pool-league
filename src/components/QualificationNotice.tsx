import { useLeague } from '../app/LeagueContext';
import { participantName, qualificationTie } from '../domain/rules';

export function QualificationNotice() {
  const { state, season } = useLeague();
  if (season.qualifiers.length) return null;
  const tied = qualificationTie(season, state.fixtures);
  if (!tied.length) return null;
  return (
    <p className="info-banner" role="status">
      Qualification is provisional: {tied.map((id) => participantName(state, id)).join(', ')} remain
      tied across the fourth-place cutoff. If still tied at finalization, an administrator-approved
      decider is required. Display order alone cannot select the qualifiers.
    </p>
  );
}

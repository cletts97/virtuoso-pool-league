import { useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { standings } from '../domain/rules';
import type { Standing } from '../domain/types';
import { FormDots, ParticipantLink } from './ui';

export function StandingsTable({ preview = false }: { preview?: boolean }) {
  const { state, season } = useLeague();
  const [sort, setSort] = useState<{ key: keyof Standing; ascending: boolean }>({
    key: 'position',
    ascending: true,
  });
  const ranked = standings(season, state.fixtures);
  const rows = preview
    ? ranked.slice(0, 5)
    : [...ranked].sort(
        (a, b) =>
          (Number(a[sort.key]) - Number(b[sort.key])) * (sort.ascending ? 1 : -1) ||
          a.position - b.position,
      );
  const columns: { label: string; key: keyof Standing; className?: string; title: string }[] = [
    { label: '#', key: 'position', title: 'League position' },
    { label: 'P', key: 'played', title: 'Matches played' },
    { label: 'W', key: 'won', title: 'Matches won' },
    { label: 'L', key: 'lost', title: 'Matches lost' },
    { label: 'FW', key: 'framesWon', title: 'Frames won', className: 'extended' },
    { label: 'FL', key: 'framesLost', title: 'Frames lost', className: 'extended' },
    { label: '+/−', key: 'difference', title: 'Frame difference' },
    { label: 'WIN %', key: 'winPercentage', title: 'Win percentage', className: 'extended' },
    { label: 'PTS', key: 'points', title: 'League points' },
  ];
  const header = (column: (typeof columns)[number]) => (
    <th
      key={column.key}
      className={column.className}
      aria-sort={sort.key === column.key ? (sort.ascending ? 'ascending' : 'descending') : 'none'}
    >
      {preview ? (
        <span title={column.title}>{column.label}</span>
      ) : (
        <button
          aria-label={`Sort by ${column.title.toLowerCase()}`}
          title={column.title}
          onClick={() =>
            setSort({
              key: column.key,
              ascending: sort.key === column.key ? !sort.ascending : column.key === 'position',
            })
          }
        >
          {column.label}
          {!preview && sort.key === column.key && <ArrowDownUp size={11} />}
        </button>
      )}
    </th>
  );
  return (
    <div
      className={`table-scroll ${preview ? 'preview-table' : ''}`}
      tabIndex={0}
      role="region"
      aria-label="League standings"
    >
      <table className="standings-table">
        <thead>
          <tr>
            {header(columns[0])}
            <th className="player-col">PLAYER</th>
            {columns
              .slice(1)
              .filter(
                (c) =>
                  !preview || !['framesWon', 'framesLost', 'winPercentage', 'lost'].includes(c.key),
              )
              .map(header)}
            {!preview && <th className="extended">FORM</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.participantId}
              className={`${row.position <= 4 ? 'qualifying' : ''} ${state.participants.find((p) => p.id === row.participantId)?.playerIds.includes(state.currentUserId) ? 'current-player' : ''}`}
            >
              <td>
                <span className={`position pos-${row.position}`}>
                  {String(row.position).padStart(2, '0')}
                </span>
              </td>
              <td>
                <ParticipantLink id={row.participantId} />
              </td>
              {columns
                .slice(1)
                .filter(
                  (c) =>
                    !preview ||
                    !['framesWon', 'framesLost', 'winPercentage', 'lost'].includes(c.key),
                )
                .map((c) => (
                  <td
                    key={c.key}
                    className={`${c.className ?? ''} ${c.key === 'points' ? 'points' : ''} ${c.key === 'difference' && row.difference > 0 ? 'positive' : ''}`}
                  >
                    {c.key === 'difference' && row.difference > 0 ? '+' : ''}
                    {String(row[c.key])}
                    {c.key === 'winPercentage' ? '%' : ''}
                  </td>
                ))}
              {!preview && (
                <td className="extended">
                  <FormDots form={row.form} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

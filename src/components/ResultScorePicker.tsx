import { useId, useState } from 'react';
import type { Score } from '../domain/types';

export function ResultScorePicker({
  homeName,
  awayName,
  ownSide,
  options,
  value,
  onChange,
}: {
  homeName: string;
  awayName: string;
  ownSide?: 'home' | 'away';
  options: Score[];
  value?: Score;
  onChange(score: Score | undefined): void;
}) {
  const id = useId();
  const [winningSide, setWinningSide] = useState<'home' | 'away' | undefined>(
    value ? (value.home > value.away ? 'home' : 'away') : undefined,
  );
  const label = (side: 'home' | 'away') =>
    ownSide
      ? side === ownSide
        ? 'I won'
        : 'I lost'
      : `${side === 'home' ? homeName : awayName} won`;
  const sides: ('home' | 'away')[] = ownSide
    ? [ownSide, ownSide === 'home' ? 'away' : 'home']
    : ['home', 'away'];
  return (
    <div className="form-stack">
      <fieldset>
        <legend>{ownSide ? 'Did you win or lose?' : 'Who won?'}</legend>
        <div className="score-options winner-options">
          {sides.map((side) => (
            <label key={side} className={winningSide === side ? 'selected' : ''}>
              <input
                type="radio"
                name={`${id}-winner`}
                required
                checked={winningSide === side}
                onChange={() => {
                  setWinningSide(side);
                  onChange(undefined);
                }}
              />
              {label(side)}
            </label>
          ))}
        </div>
      </fieldset>
      {winningSide && (
        <fieldset>
          <legend>Final score{ownSide ? ' · Your frames first' : ` · ${homeName} first`}</legend>
          <div className="score-options">
            {options
              .filter((score) => (score.home > score.away ? 'home' : 'away') === winningSide)
              .map((score) => {
                const first = ownSide === 'away' ? score.away : score.home;
                const second = ownSide === 'away' ? score.home : score.away;
                const text = `${ownSide ? label(winningSide) + ' ' : ''}${first}–${second}`;
                return (
                  <label
                    key={`${score.home}-${score.away}`}
                    className={
                      value?.home === score.home && value.away === score.away ? 'selected' : ''
                    }
                  >
                    <input
                      type="radio"
                      name={`${id}-score`}
                      required
                      checked={value?.home === score.home && value.away === score.away}
                      onChange={() => onChange(score)}
                    />
                    {text}
                  </label>
                );
              })}
          </div>
        </fieldset>
      )}
      {value && (
        <p className="result-score-summary" role="status">
          <strong>
            {homeName} {value.home}–{value.away} {awayName}
          </strong>
        </p>
      )}
    </div>
  );
}

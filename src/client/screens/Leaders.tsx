import { useState } from 'react';
import { formatTime } from '../../shared/score';
import { api } from '../api';
import { Bolt, Chevron, Flame } from '../board/icons';
import { useLoad } from '../hooks/useLoad';

type Props = { day: number; today: number; onBack: () => void };
type Scope = 'day' | 'streak';

export const Leaders = ({ day, today, onBack }: Props) => {
  const [scope, setScope] = useState<Scope>('day');
  const { data, error: problem, retry } = useLoad(`leaders:${scope}:${day}`, () =>
    api.leaderboard(scope, scope === 'day' ? day : null)
  );

  return (
    <main className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <Chevron />
        </button>
        <h1 className="display page-title">Leaders</h1>
      </header>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'day'}
          className={`tab ${scope === 'day' ? 'is-on' : ''}`}
          onClick={() => setScope('day')}
        >
          {day === today ? 'Today' : `Board #${day}`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'streak'}
          className={`tab ${scope === 'streak' ? 'is-on' : ''}`}
          onClick={() => setScope('streak')}
        >
          Streaks
        </button>
      </div>
      <p className="page-lede">
        {scope === 'day'
          ? 'Fewest charges first, then fastest. Only plays on the day itself are ranked.'
          : 'Longest runs of daily solves still going.'}
      </p>

      {problem && (
        <div className="notice">
          <p>{problem}</p>
          <button type="button" className="link" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {!data && !problem && <p className="notice silk">Reading the scoreboard…</p>}

      {data && data.rows.length === 0 && (
        <p className="notice">
          {data.scope === 'day'
            ? 'Nobody has cleared this board on its day yet. The top line is open.'
            : 'No streaks running yet. Solve two days in a row to start one.'}
        </p>
      )}

      {data && data.rows.length > 0 && (
        <ol className="ranks">
          {data.scope === 'day'
            ? data.rows.map((r, i) => (
                <li key={`${r.name}-${i}`} className={`rank ${r.you ? 'is-you' : ''}`}>
                  <span className="display rank-place">{i + 1}</span>
                  <span className="rank-name">
                    {r.name}
                    {r.you && <span className="rank-you">you</span>}
                  </span>
                  <span className="rank-score">
                    <Bolt className="is-used" />
                    {r.charges}
                  </span>
                  <span className="rank-time">{formatTime(r.seconds)}</span>
                </li>
              ))
            : data.rows.map((r, i) => (
                <li key={`${r.name}-${i}`} className={`rank ${r.you ? 'is-you' : ''}`}>
                  <span className="display rank-place">{i + 1}</span>
                  <span className="rank-name">
                    {r.name}
                    {r.you && <span className="rank-you">you</span>}
                  </span>
                  <span className="rank-score">
                    <Flame className="is-lit" />
                    {r.streak}
                  </span>
                  <span className="rank-time">days</span>
                </li>
              ))}
        </ol>
      )}
      {data?.scope === 'day' && data.rank !== null && data.rank > data.rows.length && (
        <p className="page-lede">You are in place {data.rank} of {data.total}.</p>
      )}
    </main>
  );
};

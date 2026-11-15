import { useState } from 'react';
import { api } from '../api';
import { Chevron } from '../board/icons';
import { useLoad } from '../hooks/useLoad';

type Scope = 'day' | 'week';

/** Endless mode's own boards: levels gained today, and height reached this week. */
export const EndlessLeaders = ({ onBack }: { onBack: () => void }) => {
  const [scope, setScope] = useState<Scope>('day');
  const { data, error: problem, retry } = useLoad(`endless-leaders:${scope}`, () =>
    api.endlessLeaders(scope)
  );
  const tabs: { scope: Scope; label: string }[] = [
    { scope: 'day', label: 'Today' },
    { scope: 'week', label: 'This week' },
  ];

  return (
    <main className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <Chevron />
        </button>
        <h1 className="display page-title">Climbers</h1>
      </header>

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.scope}
            type="button"
            role="tab"
            aria-selected={scope === t.scope}
            className={`tab ${scope === t.scope ? 'is-on' : ''}`}
            onClick={() => setScope(t.scope)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="page-lede">
        {scope === 'day'
          ? 'New levels reached today. Ties go to whoever got there first.'
          : 'Highest level cleared this week. The climb starts over every Monday, UTC.'}
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
          {scope === 'day' ? 'Nobody has climbed today. The top line is open.' : 'Nobody has climbed this week yet.'}
        </p>
      )}
      {data && data.rows.length > 0 && (
        <ol className="ranks">
          {data.rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className={`rank ${r.you ? 'is-you' : ''}`}>
              <span className="display rank-place">{i + 1}</span>
              <span className="rank-name">
                {r.name}
                {r.you && <span className="rank-you">you</span>}
              </span>
              <span className="rank-score">
                {scope === 'day' ? `+${r.levels}` : r.levels}
              </span>
              <span className="rank-time">{scope === 'day' ? (r.levels === 1 ? 'level' : 'levels') : 'level'}</span>
            </li>
          ))}
        </ol>
      )}
      {data && data.rank !== null && data.rank > data.rows.length && (
        <p className="page-lede">
          You are in place {data.rank} of {data.total}.
        </p>
      )}
    </main>
  );
};

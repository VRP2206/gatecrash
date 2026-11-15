import { shortDate } from '../../shared/day';
import { LEVEL_LABEL, type GameStatus } from '../../shared/types';
import { api } from '../api';
import { Bolt, Chevron, Cross } from '../board/icons';
import { useLoad } from '../hooks/useLoad';

type Props = {
  current: number;
  onPick: (day: number) => void;
  onBack: () => void;
};

const describe = (status: GameStatus, charges: number): string =>
  status === 'solved'
    ? `solved in ${charges}`
    : status === 'fused'
      ? 'fuse blown'
      : status === 'playing'
        ? 'in progress'
        : 'not played';

export const Archive = ({ current, onPick, onBack }: Props) => {
  const { data, error: problem, retry } = useLoad('archive', api.archive);

  return (
    <main className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <Chevron />
        </button>
        <h1 className="display page-title">Past boards</h1>
      </header>
      <p className="page-lede">Replay any day. Only today's boards count for your streak.</p>

      {problem && (
        <div className="notice">
          <p>{problem}</p>
          <button type="button" className="link" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {!data && !problem && <p className="notice silk">Opening the drawer…</p>}

      {data && (
        <ol className="days">
          {data.days.map((d) => (
            <li key={d.day}>
              <button
                type="button"
                className={`day ${d.day === current ? 'is-current' : ''}`}
                onClick={() => onPick(d.day)}
                aria-label={`Board ${d.day}, ${shortDate(d.dayIndex)}. ${d.levels
                  .map((l) => `${LEVEL_LABEL[l.level]}: ${describe(l.status, l.charges)}`)
                  .join(', ')}`}
              >
                <span className="display day-num">#{d.day}</span>
                <span className="day-date">
                  {shortDate(d.dayIndex)}
                  {d.day === data.today && <span className="day-today">today</span>}
                </span>
                <span className="day-marks">
                  {d.levels.map((l) => (
                    <span key={l.level} className={`day-mark is-${l.status}`}>
                      <span className="day-letter">{LEVEL_LABEL[l.level].charAt(0)}</span>
                      {l.status === 'solved' && (
                        <>
                          <Bolt className="is-used" />
                          {l.charges}
                        </>
                      )}
                      {l.status === 'fused' && <Cross />}
                      {l.status === 'playing' && <span className="day-dot" />}
                      {l.status === 'new' && <span className="day-open">–</span>}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
};

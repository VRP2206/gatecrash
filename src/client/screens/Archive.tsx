import { DIFFICULTY_LABEL, shortDate } from '../../shared/day';
import { api } from '../api';
import { Bolt, Chevron, Cross } from '../board/icons';
import { useLoad } from '../hooks/useLoad';

type Props = {
  current: number;
  onPick: (day: number) => void;
  onBack: () => void;
};

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
      <p className="page-lede">Replay any day. Only the current board counts for your streak.</p>

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
                className={`day is-${d.status} ${d.day === current ? 'is-current' : ''}`}
                onClick={() => onPick(d.day)}
                aria-label={`Board ${d.day}, ${shortDate(d.dayIndex)}, ${DIFFICULTY_LABEL[d.difficulty]}, ${
                  d.status === 'solved'
                    ? `solved in ${d.charges}`
                    : d.status === 'fused'
                      ? 'fuse blown'
                      : d.status === 'playing'
                        ? 'in progress'
                        : 'not played'
                }`}
              >
                <span className="display day-num">#{d.day}</span>
                <span className="day-date">
                  {shortDate(d.dayIndex)}
                  {d.day === data.today && <span className="day-today">today</span>}
                </span>
                <span className="day-level">{DIFFICULTY_LABEL[d.difficulty]}</span>
                <span className="day-mark">
                  {d.status === 'solved' && (
                    <>
                      <Bolt className="is-used" />
                      {d.charges}
                    </>
                  )}
                  {d.status === 'fused' && <Cross />}
                  {d.status === 'playing' && <span className="day-dot" />}
                  {d.status === 'new' && <span className="day-open">play</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
};

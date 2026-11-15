import type { LevelSummary, StreakView } from '../../shared/api';
import { LEVEL_LABEL, MAX_CHARGES, type Difficulty, type Level } from '../../shared/types';
import { Bolt, Cross, Flame } from '../board/icons';

type Props = {
  title: string;
  isToday: boolean;
  levels: LevelSummary[];
  streak: StreakView;
  loggedIn: boolean;
  onPick: (level: Level) => void;
  onEndless: () => void;
  onArchive: () => void;
  onLeaders: () => void;
  onHelp: () => void;
};

/** What makes each board harder, in plain words. */
const BLURB: Readonly<Record<Difficulty, string>> = {
  easy: '2 switches. Exactly the chips you need.',
  medium: '3 switches. Exactly the chips you need.',
  hard: '3 switches. Spare chips that do not belong.',
  overclock: 'Sunday Overclock: 4 switches, spare chips, two extra kinds.',
};

const statusText = (l: LevelSummary): string => {
  if (l.status === 'solved') return `Cleared with ${l.charges} ${l.charges === 1 ? 'charge' : 'charges'}`;
  if (l.status === 'fused') return 'Fuse blown';
  if (l.status === 'playing') return `${MAX_CHARGES - l.charges} of ${MAX_CHARGES} charges left`;
  return 'Not played';
};

/** The day's three boards. Any one solved keeps the streak going. */
export const Levels = ({
  title,
  isToday,
  levels,
  streak,
  loggedIn,
  onPick,
  onEndless,
  onArchive,
  onLeaders,
  onHelp,
}: Props) => {
  const cleared = levels.filter((l) => l.status === 'solved').length;
  return (
    <main className="page levels">
      <header className="bar">
        <div className="bar-title">
          <span className="display bar-name">Gatecrash</span>
          <span className="bar-day">
            {title}
            {!isToday && <span className="bar-tag">archive</span>}
          </span>
        </div>
        <div className="bar-tools">
          <button type="button" className="icon-btn" onClick={onHelp} aria-label="How to play">
            ?
          </button>
        </div>
      </header>

      <p className="page-lede">
        {isToday
          ? 'Three boards today. Clear any one to keep your streak; clear all three for bragging rights.'
          : 'An old set of boards. They are yours to replay, but they do not count for streaks.'}
      </p>

      <ol className="level-list">
        {levels.map((l, i) => (
          <li key={l.level}>
            <button
              type="button"
              className={`level is-${l.status}`}
              onClick={() => onPick(l.level)}
              aria-label={`${LEVEL_LABEL[l.level]}. ${BLURB[l.difficulty]} ${statusText(l)}.`}
            >
              <span className="level-pips" aria-hidden="true">
                {[0, 1, 2].map((n) => (
                  <span key={n} className={n <= i ? 'is-on' : ''} />
                ))}
              </span>
              <span className="level-text">
                <span className="display level-name">{LEVEL_LABEL[l.level]}</span>
                <span className="level-blurb">{BLURB[l.difficulty]}</span>
              </span>
              <span className="level-state">
                {l.status === 'solved' && (
                  <>
                    <Bolt className="is-used" />
                    {l.charges}
                  </>
                )}
                {l.status === 'fused' && <Cross />}
                {l.status === 'playing' && <span className="level-go">resume</span>}
                {l.status === 'new' && <span className="level-go">play</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <button type="button" className="level level-endless" onClick={onEndless}>
        <span className="level-pips" aria-hidden="true">
          <span className="is-on" />
          <span className="is-on" />
          <span className="is-on" />
        </span>
        <span className="level-text">
          <span className="display level-name">Endless</span>
          <span className="level-blurb">A weekly climb. No clock: how high can you get?</span>
        </span>
        <span className="level-state">
          <span className="level-go">climb</span>
        </span>
      </button>

      <p className="levels-foot">
        {loggedIn ? (
          <>
            <Flame className={streak.current > 0 ? 'is-lit' : ''} />
            Streak {streak.current}
            {streak.tier && <span className="levels-tier">{streak.tier}</span>}
            <span className="levels-count">{cleared} of 3 cleared</span>
          </>
        ) : (
          <span className="levels-count">Playing logged out: progress stays in this browser.</span>
        )}
      </p>

      <nav className="result-nav" aria-label="More">
        <button type="button" className="link" onClick={onArchive}>
          Past boards
        </button>
        <button type="button" className="link" onClick={onLeaders}>
          Leaders
        </button>
      </nav>
    </main>
  );
};

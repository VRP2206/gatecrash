import { useEffect, useMemo, useState } from 'react';
import type { EndlessView } from '../../shared/api';
import { ENDLESS_CHARGES, STAGE_LENGTH, stageStart, switchesAt } from '../../shared/endless';
import { NEW_DAY_STATE } from '../../shared/types';
import { Charges } from '../board/Charges';
import { Chevron } from '../board/icons';
import { endlessSession, localEndless, remoteEndless } from '../endlessClient';
import type { Journey } from '../hooks/useJourney';
import { useLoad } from '../hooks/useLoad';
import { EndlessLeaders } from './EndlessLeaders';
import { Play } from './Play';

type Props = {
  loggedIn: boolean;
  journey: Journey;
  onBack: () => void;
  onHelp: () => void;
};

const resetsIn = (ms: number): string => {
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

/** What changes next on the climb, in one line. */
const ahead = (level: number): string => {
  if (level <= 25) return 'A third switch joins at level 26.';
  if (level <= 75) return 'A fourth switch joins at level 76. The hard boards start there.';
  return 'Four switches from here on. Boards keep growing every ten levels.';
};

/** Endless mode: its own colours, a hub, the climb itself and its leaderboards. */
export const Endless = ({ loggedIn, journey, onBack, onHelp }: Props) => {
  const client = useMemo(() => (loggedIn ? remoteEndless : localEndless()), [loggedIn]);
  const { data, error: problem, retry } = useLoad('endless', client.load);
  // The run as it stands after the latest test, once the player has moved on from that board.
  const [moved, setMoved] = useState<EndlessView | null>(null);
  const [sub, setSub] = useState<'hub' | 'play' | 'leaders'>('hub');
  // Where the latest test leads; shown once the player leaves that board.
  const [after, setAfter] = useState<EndlessView | null>(null);
  const view = moved ?? data;

  // Endless wears different colours from the daily boards.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = 'endless';
    return () => {
      delete root.dataset.theme;
    };
  }, []);

  const session = useMemo(
    () => (view ? endlessSession(client, view, setAfter) : null),
    [client, view]
  );

  /** Leave the board in front of the player for whatever the last test led to. */
  const advance = () => {
    if (after) setMoved(after);
    setAfter(null);
  };

  if (problem) {
    return (
      <main className="page page-center">
        <h1 className="display page-title">Bench is dark</h1>
        <p className="page-lede">{problem}</p>
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
        <button type="button" className="link" onClick={onBack}>
          Back
        </button>
      </main>
    );
  }
  if (!view || !session) {
    return (
      <main className="page page-center" aria-busy="true">
        <p className="display loading">Warming up</p>
        <span className="loading-trace" />
      </main>
    );
  }

  if (sub === 'leaders') return <EndlessLeaders onBack={() => setSub('hub')} />;

  const first = stageStart(view.level);
  if (sub === 'play') {
    return (
      <Play
        key={`endless-${view.week}-${view.level}-${view.fuses}`}
        board={view.board}
        initial={{ ...NEW_DAY_STATE, status: 'playing', attempts: view.attempts }}
        session={session}
        journey={journey}
        name="Endless"
        title={`Level ${view.level}`}
        tag={`stage ${view.stage}`}
        elapsedAtOpen={0}
        endless={{
          burnedAtOpen: view.burned,
          solved: `Level ${view.level} cleared.`,
          fused: `Fuse blown. Back to level ${first}, on new boards.`,
          next: 'Next level',
          retry: `Level ${first}`,
        }}
        onReport={advance}
        onHelp={onHelp}
        onMenu={() => {
          advance();
          setSub('hub');
        }}
      />
    );
  }

  const done = view.level - first;
  return (
    <main className="page endless">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to today's boards">
          <Chevron />
        </button>
        <h1 className="display page-title">Endless</h1>
        <span className="endless-reset">resets in {resetsIn(view.endsInMs)}</span>
      </header>

      <section className="climb" aria-label={`Level ${view.level}, stage ${view.stage}`}>
        <span className="silk">Stage {view.stage}</span>
        <span className="display climb-level">Level {view.level}</span>
        <span className="climb-blurb">
          {switchesAt(view.level)} switches · {view.board.sockets.length} sockets
        </span>
        <span className="climb-pips" aria-hidden="true">
          {Array.from({ length: STAGE_LENGTH }, (_, i) => (
            <span key={i} className={i < done ? 'is-done' : i === done ? 'is-now' : ''} />
          ))}
        </span>
        <span className="climb-charges">
          <Charges used={view.burned} spending={false} />
          <span className="silk">
            {ENDLESS_CHARGES - view.burned} of {ENDLESS_CHARGES} charges for this stage
          </span>
        </span>
      </section>

      <dl className="climb-stats">
        <div>
          <dt>This week</dt>
          <dd className="display">{view.best}</dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd className="display">+{view.today}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd className="display">{view.record}</dd>
        </div>
      </dl>

      <button type="button" className="btn climb-go" onClick={() => setSub('play')}>
        {view.level === 1 && view.attempts.length === 0 ? 'Start the climb' : `Play level ${view.level}`}
      </button>

      <ul className="climb-rules">
        <li>Clear a board to move up. Nothing is timed.</li>
        <li>A failed test burns a charge. Burn all five and you drop to the start of the stage.</li>
        <li>Every tenth level starts a new stage and refills the charges.</li>
        <li>{ahead(view.level)}</li>
      </ul>

      <nav className="result-nav" aria-label="More">
        {loggedIn ? (
          <button type="button" className="link" onClick={() => setSub('leaders')}>
            Leaders
          </button>
        ) : (
          <span className="levels-count">Playing logged out: the climb stays in this browser.</span>
        )}
      </nav>
    </main>
  );
};

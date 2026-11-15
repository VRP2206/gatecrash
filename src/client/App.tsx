import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InitResponse, LevelSummary } from '../shared/api';
import { shortDate } from '../shared/day';
import { TUTORIAL_BOARD } from '../shared/tutorial';
import {
  LEVELS,
  LEVEL_LABEL,
  NEW_DAY_STATE,
  type DayState,
  type Level,
} from '../shared/types';
import { api } from './api';
import { useJourney } from './hooks/useJourney';
import { useLoad } from './hooks/useLoad';
import { Archive } from './screens/Archive';
import { Endless } from './screens/Endless';
import { HowTo } from './screens/HowTo';
import { Leaders } from './screens/Leaders';
import { Levels } from './screens/Levels';
import { Play } from './screens/Play';
import { Result } from './screens/Result';
import { guestKey, localSession, readGuestState, remoteSession } from './session';

type View =
  | 'levels'
  | 'play'
  | 'practice'
  | 'result'
  | 'archive'
  | 'leaders'
  | 'howto'
  | 'endless';

const TUTORIAL_KEY = 'gatecrash:practice-done';

const practiceSeen = (): boolean => {
  try {
    return window.localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
};

const isFinal = (state: DayState): boolean =>
  state.status === 'solved' || state.status === 'fused';

type Loaded = {
  init: InitResponse;
  /** The player's state when the board loaded (from the server, or this browser for guests). */
  state: DayState;
  /** Standing on all three boards (from the server, or this browser for guests). */
  levels: LevelSummary[];
  /** Client clock when the answer arrived, and when the next board is due. */
  openedAt: number;
  nextAt: number;
};

const loadBoard = async (day: number | null, level: Level | null): Promise<Loaded> => {
  const init = await api.init(day, level);
  const openedAt = Date.now();
  const guest = (l: Level) => readGuestState(init.day, l);
  return {
    init,
    state: init.loggedIn ? init.state : guest(init.level),
    levels: init.loggedIn
      ? init.levels
      : init.levels.map((l) => ({
          ...l,
          status: guest(l.level).status,
          charges: guest(l.level).attempts.length,
        })),
    openedAt,
    nextAt: openedAt + init.nextInMs,
  };
};

/** Which board is open. `visit` forces a fresh load every time a board is entered. */
type Pick = { day: number | null; level: Level | null; visit: number };

export const App = () => {
  const [pick, setPick] = useState<Pick>({ day: null, level: null, visit: 0 });
  const { data, error: problem, retry } = useLoad(
    `board:${pick.day ?? 'post'}:${pick.level ?? 'auto'}:${pick.visit}`,
    () => loadBoard(pick.day, pick.level)
  );
  // Boards finished since they were loaded, so the level list is right without a reload.
  const [finished, setFinished] = useState<Record<string, DayState>>({});
  const [nav, setNav] = useState<{ visit: number; view: View; back: View } | null>(null);
  const [practiceDone, setPracticeDone] = useState(practiceSeen);
  const [practiceRun, setPracticeRun] = useState(0);
  const init = data?.init ?? null;
  const journey = useJourney(init !== null);

  useEffect(() => {
    if (init) journey.ready();
  }, [init, journey]);

  const session = useMemo(() => {
    if (!init) return null;
    return init.loggedIn
      ? remoteSession(init.day, init.level)
      : localSession(init.board, guestKey(init.day, init.level));
  }, [init]);
  // A fresh practice session each time the practice board is opened.
  const practice = useMemo(
    () => (practiceRun >= 0 ? localSession(TUTORIAL_BOARD, null) : null),
    [practiceRun]
  );

  const endPractice = useCallback(() => {
    try {
      window.localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      // storage unavailable: the server flag below still covers logged-in players
    }
    api.tutorialDone().catch(() => undefined);
    setPracticeDone(true);
  }, []);

  if (problem) {
    return (
      <main className="page page-center">
        <h1 className="display page-title">Bench is dark</h1>
        <p className="page-lede">{problem}</p>
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
      </main>
    );
  }
  if (!data || !init || !session || !practice) {
    return (
      <main className="page page-center" aria-busy="true">
        <p className="display loading">Warming up</p>
        <span className="loading-trace" />
      </main>
    );
  }

  const key = (level: Level) => `${init.day}:${level}`;
  const state = finished[key(init.level)] ?? data.state;
  const levels = data.levels.map((l) => {
    const done = finished[key(l.level)];
    return done ? { ...l, status: done.status, charges: done.attempts.length } : l;
  });
  const untouched = levels.every((l) => l.status === 'new');
  const firstVisit = untouched && !init.tutorialDone && !practiceDone;
  // Opening the post lands on the level list; picking a level lands on its board or report.
  const home: View = firstVisit
    ? 'practice'
    : pick.level === null
      ? 'levels'
      : isFinal(state)
        ? 'result'
        : 'play';
  const current = nav && nav.visit === pick.visit ? nav : { visit: pick.visit, view: home, back: home };
  const show = (view: View) => setNav({ visit: pick.visit, view, back: current.back });
  /** Open a side page and remember where to come back to. */
  const open = (view: View) => setNav({ visit: pick.visit, view, back: current.view });
  const enter = (day: number | null, level: Level | null) => {
    setNav(null);
    setPick((now) => ({ day, level, visit: now.visit + 1 }));
  };
  const toLevels = () => {
    if (pick.level === null) show('levels');
    else enter(init.day, null);
  };

  const date = `#${init.day} · ${shortDate(init.dayIndex)}`;
  // Short enough for the play header on a narrow phone.
  const title = `#${init.day} · ${LEVEL_LABEL[init.level]}`;
  const isToday = init.day === init.today;
  const next = LEVELS.find(
    (l) => l !== init.level && !isFinal({ ...NEW_DAY_STATE, status: levels.find((x) => x.level === l)?.status ?? 'new' })
  );
  const elapsed =
    state.status === 'playing' && state.startedAt !== null
      ? Math.max(
          0,
          Math.round(((init.loggedIn ? init.now : data.openedAt) - state.startedAt) / 1000)
        )
      : 0;

  switch (current.view) {
    case 'practice':
      return (
        <Play
          key={`practice-${practiceRun}`}
          board={TUTORIAL_BOARD}
          initial={NEW_DAY_STATE}
          session={practice}
          journey={journey}
          title="Practice board"
          elapsedAtOpen={0}
          coach
          onReport={() => {
            endPractice();
            show(pick.level === null ? 'levels' : isFinal(state) ? 'result' : 'play');
          }}
        />
      );
    case 'levels':
      return (
        <Levels
          title={date}
          isToday={isToday}
          levels={levels}
          streak={init.streak}
          loggedIn={init.loggedIn}
          onPick={(level) => enter(init.day, level)}
          onEndless={() => open('endless')}
          onArchive={() => open('archive')}
          onLeaders={() => open('leaders')}
          onHelp={() => open('howto')}
        />
      );
    case 'result':
      return (
        <Result
          day={init.day}
          level={init.level}
          title={title}
          date={shortDate(init.dayIndex)}
          state={state}
          loggedIn={init.loggedIn}
          username={init.username}
          isToday={isToday}
          subreddit={init.subreddit}
          nextAt={data.nextAt}
          nextLevel={next ?? null}
          onNextLevel={(level) => enter(init.day, level)}
          onLevels={toLevels}
          onBoard={() => show('play')}
          onArchive={() => open('archive')}
          onLeaders={() => open('leaders')}
        />
      );
    case 'endless':
      return (
        <Endless
          loggedIn={init.loggedIn}
          journey={journey}
          onBack={() => show('levels')}
          onHelp={() => open('howto')}
        />
      );
    case 'archive':
      return (
        <Archive
          current={init.day}
          onBack={() => show(current.back)}
          onPick={(day) => enter(day, null)}
        />
      );
    case 'leaders':
      return (
        <Leaders
          day={init.day}
          today={init.today}
          level={pick.level ?? 'easy'}
          onBack={() => show(current.back)}
        />
      );
    case 'howto':
      return (
        <HowTo
          chips={[...new Set(init.board.tray)]}
          loggedIn={init.loggedIn}
          onForgotten={() => {
            try {
              window.localStorage.removeItem(TUTORIAL_KEY);
            } catch {
              // nothing stored, nothing to clear
            }
            window.location.reload();
          }}
          onBack={() => show(current.back)}
          onPractice={() => {
            setPracticeRun((n) => n + 1);
            show('practice');
          }}
        />
      );
    case 'play':
      return (
        <Play
          key={`board-${init.day}-${init.level}-${pick.visit}`}
          board={init.board}
          initial={state}
          session={session}
          journey={journey}
          title={title}
          tag={isToday ? null : 'archive'}
          elapsedAtOpen={elapsed}
          onReport={(final) => {
            setFinished((now) => ({ ...now, [key(init.level)]: final }));
            show('result');
          }}
          onHelp={() => open('howto')}
          onMenu={toLevels}
        />
      );
  }
};

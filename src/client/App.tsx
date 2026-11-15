import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InitResponse } from '../shared/api';
import { shortDate } from '../shared/day';
import { TUTORIAL_BOARD } from '../shared/tutorial';
import { NEW_DAY_STATE, type DayState } from '../shared/types';
import { api } from './api';
import { useJourney } from './hooks/useJourney';
import { useLoad } from './hooks/useLoad';
import { Archive } from './screens/Archive';
import { HowTo } from './screens/HowTo';
import { Leaders } from './screens/Leaders';
import { Play } from './screens/Play';
import { Result } from './screens/Result';
import { guestKey, localSession, readGuestState, remoteSession } from './session';

type View = 'play' | 'practice' | 'result' | 'archive' | 'leaders' | 'howto';

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
  /** Client clock when the answer arrived, and when the next board is due. */
  openedAt: number;
  nextAt: number;
};

const loadDay = async (day: number | null): Promise<Loaded> => {
  const init = await api.init(day);
  const openedAt = Date.now();
  return {
    init,
    state: init.loggedIn ? init.state : readGuestState(init.day),
    openedAt,
    nextAt: openedAt + init.nextInMs,
  };
};

export const App = () => {
  const [day, setDay] = useState<number | null>(null);
  const { data, error: problem, retry } = useLoad(`day:${day ?? 'post'}`, () => loadDay(day));
  // What the player has done since the board loaded, keyed so a new day starts clean.
  const [progress, setProgress] = useState<{ day: number; state: DayState } | null>(null);
  const [nav, setNav] = useState<{ day: number; view: View; back: View } | null>(null);
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
      ? remoteSession(init.day)
      : localSession(init.board, guestKey(init.day));
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

  const state = progress && progress.day === init.day ? progress.state : data.state;
  const firstVisit = state.status === 'new' && !init.tutorialDone && !practiceDone;
  const home: View = isFinal(state) ? 'result' : firstVisit ? 'practice' : 'play';
  const current = nav && nav.day === init.day ? nav : { day: init.day, view: home, back: home };
  const show = (view: View) => setNav({ day: init.day, view, back: current.back });
  /** Open a side page and remember where to come back to. */
  const open = (view: View) => setNav({ day: init.day, view, back: current.view });

  const title = `#${init.day} · ${shortDate(init.dayIndex)}`;
  const isToday = init.day === init.today;
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
            show(isFinal(state) ? 'result' : 'play');
          }}
        />
      );
    case 'result':
      return (
        <Result
          day={init.day}
          title={title}
          state={state}
          loggedIn={init.loggedIn}
          username={init.username}
          isToday={isToday}
          subreddit={init.subreddit}
          nextAt={data.nextAt}
          onBoard={() => show('play')}
          onArchive={() => open('archive')}
          onLeaders={() => open('leaders')}
        />
      );
    case 'archive':
      return (
        <Archive
          current={init.day}
          onBack={() => show(current.back)}
          onPick={(next) => {
            if (next === init.day) show(isFinal(state) ? 'result' : 'play');
            else setDay(next);
          }}
        />
      );
    case 'leaders':
      return <Leaders day={init.day} today={init.today} onBack={() => show(current.back)} />;
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
          key={`day-${init.day}`}
          board={init.board}
          initial={state}
          session={session}
          journey={journey}
          title={title}
          tag={isToday ? null : 'archive'}
          elapsedAtOpen={elapsed}
          onReport={(final) => {
            setProgress({ day: init.day, state: final });
            show('result');
          }}
          onHelp={() => open('howto')}
          onMenu={() => open('archive')}
        />
      );
  }
};

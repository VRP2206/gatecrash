import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluate, isComplete, rowCount, simulate, type Signals } from '../../shared/sim';
import { solve } from '../../shared/solve';
import {
  CHIP_INFO,
  MAX_CHARGES,
  type Board,
  type ChipType,
  type DayState,
  type FullPlacement,
  type Placement,
  type RowResult,
} from '../../shared/types';
import { messageOf } from '../api';
import type { Session } from '../session';
import type { Journey } from './useJourney';

/** One Power press: the placement tested and how far the row-by-row replay has got. */
export type Run = {
  attempt: FullPlacement;
  rows: RowResult[];
  /** Rows revealed so far. */
  shown: number;
  active: boolean;
};

export type Game = ReturnType<typeof useGame>;

const same = (a: Placement, b: Placement): boolean =>
  a.length === b.length && a.every((chip, i) => chip === b[i]);

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** How long each row is held during the replay; more rows run faster. */
const stepMs = (rows: number): number => {
  if (prefersReducedMotion()) return 90;
  if (rows <= 4) return 820;
  if (rows <= 8) return 520;
  return 300;
};

const finished = (state: DayState): boolean =>
  state.status === 'solved' || state.status === 'fused';

type Options = {
  board: Board;
  initial: DayState;
  session: Session;
  journey: Journey;
  /**
   * Endless mode: charges already burned in this stage when the board opened.
   * There, only failed tests cost a charge and the count carries across boards.
   */
  burnedAtOpen?: number | undefined;
};

export const useGame = ({ board, initial, session, journey, burnedAtOpen }: Options) => {
  const empty = useMemo<Placement>(() => board.sockets.map(() => null), [board]);
  const lastAttempt = initial.attempts[initial.attempts.length - 1];

  const [state, setState] = useState<DayState>(initial);
  const [placement, setPlacement] = useState<Placement>(lastAttempt ?? empty);
  const [hand, setHand] = useState<ChipType | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(() =>
    lastAttempt
      ? {
          attempt: lastAttempt,
          rows: simulate(board, lastAttempt),
          shown: rowCount(board.inputs),
          active: false,
        }
      : null
  );
  const [pending, setPending] = useState(false);
  // Switch setting on the bench. Starts on the first row a restored test failed.
  const [bench, setBench] = useState<number>(
    () =>
      (lastAttempt ? simulate(board, lastAttempt).find((r) => !r.ok)?.row : undefined) ??
      board.probeRow
  );
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState<{ socket: number; at: number } | null>(null);
  const timer = useRef<number | null>(null);

  const final = finished(state);
  const running = run?.active === true;
  const locked = final || running || pending;

  // Stamp the start as soon as the board is on screen.
  useEffect(() => {
    if (initial.status !== 'new') return;
    let live = true;
    session
      .start()
      .then((next) => {
        if (live) setState((now) => (now.status === 'new' ? next : now));
      })
      .catch(() => undefined); // power() starts the game too, so this can fail quietly
    return () => {
      live = false;
    };
  }, [initial.status, session]);

  // Replay: hold each row for a beat, reveal its result, move to the next.
  const replaying = run?.active === true;
  const replayAt = run?.shown ?? 0;
  const replayRows = run?.rows.length ?? 0;
  useEffect(() => {
    if (!replaying) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setRun((now) => {
        if (!now || !now.active) return now;
        const shown = now.shown + 1;
        return { ...now, shown, active: shown < now.rows.length };
      });
    }, stepMs(replayRows));
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [replaying, replayAt, replayRows]);

  /** Chips still in the tray, by kind, in tray order. */
  const tray = useMemo(() => {
    const kinds: { chip: ChipType; total: number; left: number }[] = [];
    for (const chip of board.tray) {
      const entry = kinds.find((k) => k.chip === chip);
      if (entry) {
        entry.total++;
        entry.left++;
      } else {
        kinds.push({ chip, total: 1, left: 1 });
      }
    }
    for (const chip of placement) {
      const entry = kinds.find((k) => k.chip === chip);
      if (entry) entry.left--;
    }
    return kinds;
  }, [board, placement]);

  const fits = useCallback(
    (chip: ChipType, socket: number): boolean =>
      CHIP_INFO[chip].arity === (board.sockets[socket]?.inputs.length ?? 0),
    [board]
  );

  const put = useCallback(
    (chip: ChipType, socket: number) => {
      journey.start();
      setPlacement((now) => now.map((c, i) => (i === socket ? chip : c)));
      setError(null);
    },
    [journey]
  );

  const pick = useCallback(
    (chip: ChipType) => {
      if (locked) return;
      const entry = tray.find((k) => k.chip === chip);
      if (!entry || entry.left <= 0) return;
      if (armed !== null) {
        if (fits(chip, armed)) {
          put(chip, armed);
          setArmed(null);
          setHand(null);
        } else {
          setNudge({ socket: armed, at: Date.now() });
        }
        return;
      }
      setHand((now) => (now === chip ? null : chip));
    },
    [armed, fits, locked, put, tray]
  );

  const tapSocket = useCallback(
    (socket: number) => {
      if (locked) return;
      const current = placement[socket] ?? null;
      if (hand !== null) {
        if (!fits(hand, socket)) {
          setNudge({ socket, at: Date.now() });
          return;
        }
        if (current === hand) return;
        const entry = tray.find((k) => k.chip === hand);
        put(hand, socket);
        // Keep the chip in hand while the tray has more of it and a socket is still empty.
        const gaps = placement.filter((c, i) => c === null && i !== socket).length;
        if (!entry || entry.left <= 1 || gaps === 0) setHand(null);
        return;
      }
      if (current !== null) {
        setPlacement((now) => now.map((c, i) => (i === socket ? null : c)));
        setArmed(null);
        return;
      }
      setArmed((now) => (now === socket ? null : socket));
    },
    [fits, hand, locked, placement, put, tray]
  );

  /** Drag-and-drop: seat `chip` in socket `to`, coming from the tray or from socket `from`. */
  const drop = useCallback(
    (chip: ChipType, from: number | null, to: number) => {
      if (locked || from === to) return;
      if (!fits(chip, to)) {
        setNudge({ socket: to, at: Date.now() });
        return;
      }
      if (from === null) {
        const left = tray.find((k) => k.chip === chip)?.left ?? 0;
        // Dropping onto a socket that already holds this chip frees one up.
        if (left + (placement[to] === chip ? 1 : 0) <= 0) return;
      }
      journey.start();
      setPlacement((now) => {
        const next = [...now];
        const displaced = next[to] ?? null;
        next[to] = chip;
        // Moving between sockets swaps when the displaced chip fits the old socket.
        if (from !== null) next[from] = displaced && fits(displaced, from) ? displaced : null;
        return next;
      });
      setHand(null);
      setArmed(null);
      setError(null);
    },
    [fits, journey, locked, placement, tray]
  );

  /** Take the chip out of a socket and return it to the tray. */
  const lift = useCallback(
    (socket: number) => {
      if (locked) return;
      setPlacement((now) => now.map((c, i) => (i === socket ? null : c)));
    },
    [locked]
  );

  const clear = useCallback(() => {
    if (locked) return;
    setPlacement(empty);
    setHand(null);
    setArmed(null);
  }, [empty, locked]);

  const complete = isComplete(board, placement);
  const repeat = complete && state.attempts.some((a) => same(a, placement));
  const spent =
    burnedAtOpen === undefined
      ? state.attempts.length
      : burnedAtOpen +
        state.attempts.length -
        initial.attempts.length -
        (state.status === 'solved' ? 1 : 0);
  const used = spent + (pending ? 1 : 0);
  const canPower = complete && !locked && !repeat && used < MAX_CHARGES;

  const power = useCallback(() => {
    if (!canPower || !isComplete(board, placement)) return;
    const attempt: FullPlacement = [...placement];
    setHand(null);
    setArmed(null);
    setError(null);
    setPending(true);
    const rows = simulate(board, attempt);
    setRun({ attempt, rows, shown: 0, active: true });
    // When the test is over, leave the switches on the first row that failed.
    setBench((now) => rows.find((r) => !r.ok)?.row ?? now);
    journey.progress(Math.min(1, (state.attempts.length + 1) / MAX_CHARGES), 'power');

    session
      .power(attempt)
      .then((next) => {
        setState(next);
        setPending(false);
        if (finished(next)) {
          journey.end(next.status === 'solved', MAX_CHARGES - next.attempts.length + 1);
        }
      })
      .catch((cause: unknown) => {
        setPending(false);
        setRun(null);
        setError(messageOf(cause));
      });
  }, [board, canPower, journey, placement, session, state.attempts.length]);

  const skip = useCallback(() => {
    setRun((now) => (now && now.active ? { ...now, shown: now.rows.length, active: false } : now));
  }, []);

  /** One winning placement, worked out locally once the fuse has blown. */
  const reveal = useMemo<FullPlacement | null>(
    () => (state.status === 'fused' ? (solve(board, 1).solutions[0] ?? null) : null),
    [board, state.status]
  );
  const [showAnswer, setShowAnswer] = useState(false);
  const shownPlacement: Placement = showAnswer && reveal ? reveal : placement;

  // The card shows results only while the board still holds the tested chips.
  const fresh = run !== null && same(run.attempt, shownPlacement);
  const answerRows = useMemo(
    () => (showAnswer && reveal ? simulate(board, reveal) : null),
    [board, reveal, showAnswer]
  );
  const tested: RowResult[] | null =
    answerRows ?? (fresh && run ? run.rows.slice(0, run.shown) : null);
  const signals: Signals = useMemo(
    () => evaluate(board, shownPlacement),
    [board, shownPlacement]
  );

  // Which row is on the bench: the one being replayed, or the player's own switch setting.
  const row = running && run ? Math.min(run.shown, run.rows.length - 1) : bench;

  const liveRow = useMemo(() => simulate(board, shownPlacement)[row] ?? null, [
    board,
    row,
    shownPlacement,
  ]);

  /** Set the switches to one row of the card. */
  const inspect = useCallback(
    (r: number) => {
      if (!running) setBench(r);
    },
    [running]
  );
  /** Flip one switch by hand. Free: it only changes what the board shows. */
  const flip = useCallback(
    (index: number) => {
      if (running) return;
      journey.start();
      setBench((now) => now ^ (1 << (board.inputs - 1 - index)));
    },
    [board.inputs, journey, running]
  );

  return {
    board,
    state,
    placement: shownPlacement,
    signals,
    tray,
    hand,
    armed,
    nudge,
    pick,
    tapSocket,
    drop,
    lift,
    clear,
    power,
    skip,
    canPower,
    complete,
    repeat,
    running,
    pending,
    final,
    locked,
    used,
    chargesLeft: MAX_CHARGES - used,
    run,
    tested,
    row,
    /** Result of the row on the bench for the chips on the board right now. */
    liveRow: complete || showAnswer ? liveRow : null,
    inspect,
    flip,
    error,
    dismissError: () => setError(null),
    reveal,
    showAnswer,
    setShowAnswer,
  };
};

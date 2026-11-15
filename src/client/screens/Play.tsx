import { useEffect, useState } from 'react';
import { formatTime, secondsTaken } from '../../shared/score';
import { rowCount } from '../../shared/sim';
import { CHIP_INFO, type Board, type DayState } from '../../shared/types';
import { BoardSvg } from '../board/BoardSvg';
import { Charges } from '../board/Charges';
import { TargetCard } from '../board/TargetCard';
import { Tray } from '../board/Tray';
import { Bolt } from '../board/icons';
import { useBeat } from '../hooks/useBeat';
import { useGame, type Game } from '../hooks/useGame';
import type { Journey } from '../hooks/useJourney';
import type { Session } from '../session';

type Props = {
  board: Board;
  initial: DayState;
  session: Session;
  journey: Journey;
  /** Header line, e.g. "#12 · Wed 25 Nov". */
  title: string;
  tag?: string | null;
  /** Seconds already on the clock when the screen opened. */
  elapsedAtOpen: number;
  /** Practice mode: coach marks, no clock. */
  coach?: boolean;
  onReport: (state: DayState) => void;
  onHelp?: () => void;
  onMenu?: () => void;
};

const useClock = (running: boolean, base: number): number => {
  const [seconds, setSeconds] = useState(base);
  useEffect(() => {
    if (!running) return;
    const opened = Date.now();
    const id = window.setInterval(
      () => setSeconds(base + Math.floor((Date.now() - opened) / 1000)),
      500
    );
    return () => window.clearInterval(id);
  }, [running, base]);
  return seconds;
};

/** The one line under the board that says what to do next. */
const statusLine = (game: Game, coach: boolean): string => {
  const { board, state, run } = game;
  if (game.error) return game.error;
  if (game.running && run) {
    return `Testing row ${Math.min(run.shown + 1, run.rows.length)} of ${run.rows.length}. Tap the board to skip.`;
  }
  if (state.status === 'solved') return coach ? 'Every row passes.' : 'Every row passes. Board cleared.';
  if (state.status === 'fused') {
    return game.showAnswer ? 'One way to wire it.' : 'Out of charges. The fuse has blown.';
  }
  if (game.hand) return `Tap a socket to seat ${CHIP_INFO[game.hand].label}.`;
  if (game.armed !== null) return `Pick a chip for socket U${game.armed + 1}.`;
  if (game.repeat) return 'You already tested this arrangement.';
  if (game.tested && run) {
    const passed = run.rows.filter((r) => r.ok).length;
    return `${passed} of ${run.rows.length} rows pass. Tap a row to see it on the board.`;
  }
  if (game.complete && game.liveRow) {
    return game.liveRow.ok
      ? 'The live row passes. Power tests the rest.'
      : 'The live row fails. Swap chips, or power to see every row.';
  }
  const empty = board.sockets.length - game.placement.filter(Boolean).length;
  if (empty === board.sockets.length) return 'Tap a chip, then tap a socket.';
  return `${empty} ${empty === 1 ? 'socket' : 'sockets'} to fill.`;
};

type Zone = 'tray' | 'board' | 'power' | 'card';

/** Practice-board coaching: one short hint and the part of the screen it is about. */
const coachHint = (game: Game): { zone: Zone; text: string } | null => {
  if (game.final || game.running) return null;
  const placed = game.placement.filter(Boolean).length;
  if (game.tested && !game.tested.every((r) => r.ok)) {
    return {
      zone: 'card',
      text: 'A cross marks a wrong bulb. Tap a chip on the board to pull it out, then try the other way round.',
    };
  }
  if (game.complete) {
    return {
      zone: 'power',
      text: 'The live row is checked for free. Power tests every row and costs one charge.',
    };
  }
  if (game.hand || game.armed !== null) {
    return { zone: 'board', text: 'Now tap a socket on the board to seat it.' };
  }
  if (placed === 0) {
    return {
      zone: 'tray',
      text: 'Each chip shows what it does: wires in on the left, result on the right. Tap one.',
    };
  }
  return { zone: 'tray', text: 'One more. Tap the other chip.' };
};

export const Play = ({
  board,
  initial,
  session,
  journey,
  title,
  tag = null,
  elapsedAtOpen,
  coach = false,
  onReport,
  onHelp,
  onMenu,
}: Props) => {
  const game = useGame({ board, initial, session, journey });
  // The report is offered once the last test has finished replaying.
  const done = game.final && !game.running && !game.pending ? game.state : null;
  const beat = useBeat();
  const ticking = !coach && game.state.status === 'playing';
  const clock = useClock(ticking, elapsedAtOpen);
  const seconds = game.final ? secondsTaken(game.state) : clock;
  const hint = coach ? coachHint(game) : null;
  const status = statusLine(game, coach);
  const wide = rowCount(board.inputs) > 8;

  return (
    <main className={`play ${wide ? 'is-dense' : ''} ${coach ? 'is-coach' : ''}`}>
      <header className="bar">
        <div className="bar-title">
          <span className="display bar-name">Gatecrash</span>
          <span className="bar-day">
            {title}
            {tag && <span className="bar-tag">{tag}</span>}
          </span>
        </div>
        <div className="bar-tools">
          {!coach && (
            <span className="bar-clock" aria-label={`Time ${formatTime(seconds)}`}>
              {formatTime(seconds)}
            </span>
          )}
          {onMenu && (
            <button type="button" className="icon-btn" onClick={onMenu} aria-label="Past boards">
              <svg viewBox="0 0 16 16" aria-hidden="true" className="glyph glyph-line">
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              </svg>
            </button>
          )}
          {onHelp && (
            <button type="button" className="icon-btn" onClick={onHelp} aria-label="How to play">
              ?
            </button>
          )}
        </div>
      </header>

      <div
        className={`zone zone-board ${hint?.zone === 'board' ? 'is-hinted' : ''} ${game.state.status === 'solved' && !game.running ? 'is-cleared' : ''} ${
          game.state.status === 'fused' && !game.running ? 'is-fused' : ''
        }`}
        onClick={game.running ? game.skip : undefined}
      >
        <BoardSvg
          board={board}
          placement={game.placement}
          signals={game.signals}
          row={game.row}
          hand={game.hand}
          armed={game.armed}
          nudge={game.nudge}
          locked={game.locked}
          running={game.running}
          showVerdict={game.complete || game.showAnswer}
          onSocket={game.tapSocket}
        />
      </div>

      <div className={`zone zone-card ${hint?.zone === 'card' ? 'is-hinted' : ''}`}>
        <TargetCard
          board={board}
          tested={game.tested}
          liveRow={game.liveRow}
          current={game.row}
          canInspect={game.canInspect}
          onInspect={game.inspect}
        />
      </div>

      {hint ? (
        <p
          key={hint.text}
          className={`status coach ${hint.zone === 'tray' || hint.zone === 'power' ? 'points-down' : 'points-up'}`}
          role="status"
          aria-live="polite"
        >
          {hint.text}
        </p>
      ) : (
        <p className={`status ${game.error ? 'is-error' : ''}`} role="status" aria-live="polite">
          {status}
        </p>
      )}

      <div className={`zone zone-tray ${hint?.zone === 'tray' ? 'is-hinted' : ''}`}>
        <Tray tray={game.tray} hand={game.hand} locked={game.locked} beat={beat} onPick={game.pick} />
      </div>

      <footer className={`zone zone-power ${hint?.zone === 'power' ? 'is-hinted' : ''}`}>
        <div className="power-meter">
          <Charges used={game.used} spending={game.pending} />
          {!done && (
            <span className="silk">
              {game.chargesLeft} {game.chargesLeft === 1 ? 'charge' : 'charges'} left
            </span>
          )}
        </div>
        {done ? (
          <div className="power-actions">
            {game.reveal && (
              <button
                type="button"
                className="link"
                aria-pressed={game.showAnswer}
                onClick={() => game.setShowAnswer(!game.showAnswer)}
              >
                {game.showAnswer ? 'My board' : 'Show a fix'}
              </button>
            )}
            <button type="button" className="btn btn-report" onClick={() => onReport(done)}>
              {coach ? "Play today's board" : 'See report'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-power"
            disabled={!game.canPower}
            onClick={game.power}
          >
            <Bolt />
            Power
          </button>
        )}
      </footer>
    </main>
  );
};

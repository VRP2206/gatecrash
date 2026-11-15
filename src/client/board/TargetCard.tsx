import type { CSSProperties } from 'react';
import { inputOn, rowCount } from '../../shared/sim';
import type { Board, RowResult } from '../../shared/types';
import { Arrow, BulbPip, Cross, SwitchPip, Tick } from './icons';

type Props = {
  board: Board;
  /** Rows revealed by the last Power press, if the board still holds those chips. */
  tested: RowResult[] | null;
  /** Free result for the live row with the chips on the board now. */
  liveRow: RowResult | null;
  /** Row currently shown on the board. */
  current: number;
  canInspect: boolean;
  onInspect: (row: number) => void;
};

const describe = (board: Board, row: number): string => {
  const ins: string[] = [];
  for (let i = 0; i < board.inputs; i++) {
    ins.push(`switch ${i + 1} ${inputOn(board.inputs, i, row) ? 'on' : 'off'}`);
  }
  const outs = board.target.map(
    (mask, bulb) => `bulb ${bulb + 1} ${(mask >> row) & 1 ? 'lit' : 'dark'}`
  );
  return `${ins.join(', ')}: ${outs.join(', ')}`;
};

/** The target: for every switch combination, which bulbs should be lit. */
export const TargetCard = ({ board, tested, liveRow, current, canInspect, onInspect }: Props) => {
  const rows = rowCount(board.inputs);
  const rest: number[] = [];
  for (let r = 0; r < rows; r++) if (r !== board.probeRow) rest.push(r);
  const columns = rest.length > 4 ? 2 : 1;

  const renderRow = (row: number) => {
    const isLive = row === board.probeRow;
    const result = tested?.find((t) => t.row === row) ?? (isLive ? liveRow : null);
    const verdict = result ? (result.ok ? 'ok' : 'bad') : 'none';
    return (
      <button
        type="button"
        className={`card-row is-${verdict} ${row === current ? 'is-current' : ''} ${isLive ? 'is-live' : ''}`}
        disabled={!canInspect && !isLive}
        onClick={() => onInspect(row)}
        aria-label={`${describe(board, row)}. ${
          result ? (result.ok ? 'Passes.' : 'Fails.') : isLive ? 'Live row.' : 'Not tested.'
        }`}
      >
        {isLive && <span className="card-live">live</span>}
        <span className="card-ins">
          {Array.from({ length: board.inputs }, (_, i) => (
            <SwitchPip key={i} on={inputOn(board.inputs, i, row)} />
          ))}
        </span>
        <Arrow className="card-arrow" />
        <span className="card-outs">
          {board.target.map((mask, bulb) => {
            const want = ((mask >> row) & 1) === 1;
            const match = result?.match[bulb];
            return (
              <span key={bulb} className="card-out">
                <BulbPip on={want} />
                {match === undefined ? (
                  <span className="card-blank" />
                ) : match ? (
                  <Tick />
                ) : (
                  <Cross />
                )}
              </span>
            );
          })}
        </span>
      </button>
    );
  };

  return (
    <section className={`card ${columns === 2 ? 'is-split' : ''}`} aria-label="Test card">
      <header className="card-head">
        <span className="silk">Test card</span>
        <span className="card-key">switches set like this should light these bulbs</span>
      </header>
      {renderRow(board.probeRow)}
      <ol
        className="card-rows"
        style={{ '--rows': Math.ceil(rest.length / columns) } as CSSProperties}
      >
        {rest.map((row) => (
          <li key={row}>{renderRow(row)}</li>
        ))}
      </ol>
    </section>
  );
};

import { useMemo, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { inputOn, type Signals } from '../../shared/sim';
import { CHIP_INFO, type Board, type ChipType, type Placement, type Source } from '../../shared/types';
import { ChipBody } from './ChipArt';
import {
  BULB_R,
  PIN_LEN,
  PIN_SPREAD,
  SOCKET_H,
  SWITCH_H,
  SWITCH_PAD,
  SWITCH_W,
  layoutBoard,
} from './layout';

type Props = {
  board: Board;
  placement: Placement;
  signals: Signals;
  /** Input row currently on the bench. */
  row: number;
  hand: ChipType | null;
  armed: number | null;
  nudge: { socket: number; at: number } | null;
  locked: boolean;
  /** True while a Power press is replaying; makes signals sweep left to right. */
  running: boolean;
  /** Show tick/cross badges on the bulbs for this row. */
  showVerdict: boolean;
  onSocket: (socket: number) => void;
  /** Flip a switch by hand; left out while a test is replaying. */
  onSwitch?: ((index: number) => void) | undefined;
  /** Socket a dragged chip is hovering over. */
  dropTarget?: number | null;
  /** Socket whose chip is being dragged away. */
  lifted?: number | null;
  /** Pointer went down on a seated chip: the start of a possible drag. */
  onGrab?: (event: PointerEvent, chip: ChipType, socket: number) => void;
};

const activate = (run: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    run();
  }
};

export const BoardSvg = ({
  board,
  placement,
  signals,
  row,
  hand,
  armed,
  nudge,
  locked,
  running,
  showVerdict,
  onSocket,
  onSwitch,
  dropTarget = null,
  lifted = null,
  onGrab,
}: Props) => {
  const layout = useMemo(() => layoutBoard(board), [board]);
  const SOCKET_W = layout.socketW;
  const tight = SOCKET_W < 50;

  const state = (source: Source): 'on' | 'off' | 'dead' => {
    if (source.kind === 'in') return inputOn(board.inputs, source.index, row) ? 'on' : 'off';
    if (!signals.live[source.index]) return 'dead';
    return ((signals.sockets[source.index] ?? 0) >> row) & 1 ? 'on' : 'off';
  };
  const delay = (column: number) => ({ '--col': column }) as CSSProperties;

  return (
    <svg
      className={`board ${running ? 'is-running' : ''}`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Circuit board"
    >
      <rect className="pcb" x={1} y={1} width={layout.width - 2} height={layout.height - 2} rx={6} />
      <rect className="pcb-frame" x={6} y={6} width={layout.width - 12} height={layout.height - 12} rx={3} />
      {[
        [13, 13],
        [layout.width - 13, 13],
        [13, layout.height - 13],
        [layout.width - 13, layout.height - 13],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} className="pcb-hole" cx={x} cy={y} r={3.5} />
      ))}
      <text className="pcb-mark" x={24} y={layout.height - 10.5}>
        GC-{String(board.day).padStart(4, '0')}
      </text>

      <g className="wires">
        {layout.wires.map((wire) => {
          const s = state(wire.from);
          return (
            <g key={wire.key} className={`wire is-${s}`} style={delay(wire.column)}>
              <path className="wire-base" d={wire.d} />
              <path className="wire-core" d={wire.d} />
              {s === 'on' && <path key={`${row}`} className="wire-flow" d={wire.d} />}
            </g>
          );
        })}
        {layout.junctions.map((p) => (
          <circle key={`${p.x}-${p.y}`} className="junction" cx={p.x} cy={p.y} r={3} />
        ))}
      </g>

      {layout.switches.map((p, i) => {
        const on = inputOn(board.inputs, i, row);
        return (
          <g
            key={i}
            className={`switch ${on ? 'is-on' : ''}`}
            role="switch"
            tabIndex={onSwitch ? 0 : -1}
            aria-checked={on}
            aria-disabled={!onSwitch}
            aria-label={`Switch ${i + 1}`}
            onClick={onSwitch ? () => onSwitch(i) : undefined}
            onKeyDown={onSwitch ? activate(() => onSwitch(i)) : undefined}
          >
            <text className="designator" x={p.x} y={p.y - SWITCH_H / 2 - 5} textAnchor="middle">
              SW{i + 1}
            </text>
            <rect
              className="switch-body"
              x={p.x - SWITCH_W / 2}
              y={p.y - SWITCH_H / 2}
              width={SWITCH_W}
              height={SWITCH_H}
              rx={3}
            />
            <rect
              className="switch-knob"
              x={on ? p.x + 1 : p.x - SWITCH_W / 2 + 3}
              y={p.y - SWITCH_H / 2 + 3}
              width={SWITCH_W / 2 - 4}
              height={SWITCH_H - 6}
              rx={2}
            />
            {on && <circle className="switch-lamp" cx={p.x - SWITCH_W / 4 - 0.5} cy={p.y} r={2.4} />}
            <rect
              className="hit"
              x={p.x - SWITCH_W / 2 - SWITCH_PAD}
              y={p.y - SWITCH_H / 2 - SWITCH_PAD * 2}
              width={SWITCH_W + SWITCH_PAD * 2}
              height={SWITCH_H + SWITCH_PAD * 4}
            />
          </g>
        );
      })}

      {layout.sockets.map((p, i) => {
        const socket = board.sockets[i];
        const chip = placement[i] ?? null;
        const wires = socket?.inputs.length ?? 2;
        const invites = !locked && chip === null && hand !== null && CHIP_INFO[hand].arity === wires;
        const out = state({ kind: 'socket', index: i });
        const pins = wires === 1 ? [0] : [-PIN_SPREAD, PIN_SPREAD];
        const label = chip
          ? `Socket ${i + 1}: ${CHIP_INFO[chip].label}. Tap to take it out.`
          : `Socket ${i + 1}: empty, takes ${wires === 1 ? 'one wire' : 'two wires'}.`;
        const shake = nudge && nudge.socket === i ? nudge.at : 0;
        return (
          <g
            key={i}
            className={[
              'socket',
              chip ? 'is-filled' : 'is-empty',
              wires === 1 ? 'is-single' : '',
              invites ? 'is-open' : '',
              armed === i || dropTarget === i ? 'is-armed' : '',
              lifted === i ? 'is-lifted' : '',
              out === 'on' ? 'is-on' : '',
            ].join(' ')}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-label={label}
            aria-disabled={locked}
            data-socket={i}
            onClick={() => onSocket(i)}
            onPointerDown={chip && onGrab ? (event) => onGrab(event, chip, i) : undefined}
            onKeyDown={activate(() => onSocket(i))}
          >
            <g key={shake} className={shake ? 'shake' : ''}>
              {pins.map((dy) => (
                <rect
                  key={dy}
                  className="pin"
                  x={p.x - SOCKET_W / 2 - PIN_LEN}
                  y={p.y + dy - 2}
                  width={PIN_LEN + 2}
                  height={4}
                />
              ))}
              <rect className="pin" x={p.x + SOCKET_W / 2 - 2} y={p.y - 2} width={PIN_LEN + 2} height={4} />
              {chip ? (
                <g className="seated" key={chip}>
                  <ChipBody
                    chip={chip}
                    x={p.x}
                    y={p.y}
                    w={SOCKET_W}
                    h={SOCKET_H}
                    fontSize={
                      CHIP_INFO[chip].label.length > 6 ? (tight ? 7.2 : 8.6) : tight ? 8.6 : 9.6
                    }
                  />
                </g>
              ) : (
                <>
                  <rect
                    className="footprint"
                    x={p.x - SOCKET_W / 2}
                    y={p.y - SOCKET_H / 2}
                    width={SOCKET_W}
                    height={SOCKET_H}
                    rx={2}
                  />
                  <text className="designator" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">
                    U{i + 1}
                  </text>
                </>
              )}
            </g>
            <rect
              className="hit"
              x={p.x - SOCKET_W / 2 - PIN_LEN}
              y={p.y - SOCKET_H / 2 - 2}
              width={SOCKET_W + PIN_LEN * 2}
              height={SOCKET_H + 4}
            />
          </g>
        );
      })}

      {layout.bulbs.map((p, i) => {
        const from = board.bulbs[i] ?? 0;
        const s = state({ kind: 'socket', index: from });
        const want = (((board.target[i] ?? 0) >> row) & 1) === 1;
        const lit = s === 'on';
        const verdict = showVerdict && s !== 'dead' ? (lit === want ? 'ok' : 'bad') : null;
        const layers = layout.columns - 1;
        return (
          <g
            key={i}
            className={`bulb ${lit ? 'is-lit' : ''} ${want ? 'is-wanted' : ''}`}
            style={delay(layers)}
          >
            <text className="designator" x={p.x} y={p.y - BULB_R - 9} textAnchor="middle">
              L{i + 1}
            </text>
            {want && <circle className="bulb-want" cx={p.x} cy={p.y} r={BULB_R + 4.5} />}
            {lit && (
              <path
                className="bulb-rays"
                d={[0, 45, 90, 135, 180, 225, 270, 315]
                  .map((deg) => {
                    const a = (deg * Math.PI) / 180;
                    const r1 = BULB_R + 2.5;
                    const r2 = BULB_R + 7;
                    return `M${(p.x + Math.cos(a) * r1).toFixed(1)} ${(p.y + Math.sin(a) * r1).toFixed(1)}L${(p.x + Math.cos(a) * r2).toFixed(1)} ${(p.y + Math.sin(a) * r2).toFixed(1)}`;
                  })
                  .join('')}
              />
            )}
            <circle className="bulb-dome" cx={p.x} cy={p.y} r={BULB_R} />
            <path
              className="bulb-filament"
              d={`M${p.x - 5} ${p.y + 2}l2.5 -5 2.5 5 2.5 -5 2.5 5`}
            />
            {verdict && (
              <g className={`verdict is-${verdict}`} transform={`translate(${p.x + BULB_R - 1} ${p.y + BULB_R - 1})`}>
                <circle r={6.5} />
                {verdict === 'ok' ? <path d="M-3 0.3 -1 2.6 3 -2.4" /> : <path d="M-2.5 -2.5 2.5 2.5M2.5 -2.5 -2.5 2.5" />}
              </g>
            )}
            <title>
              {`Bulb ${i + 1} is ${s === 'dead' ? 'not connected yet' : lit ? 'lit' : 'dark'}; it should be ${want ? 'lit' : 'dark'} on this row.`}
            </title>
          </g>
        );
      })}
    </svg>
  );
};

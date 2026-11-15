import type { Board, Source } from '../../shared/types';

/*
 * Board geometry in SVG units. Pure maths, no DOM: BoardSvg just draws what
 * this returns. Columns run left to right: switches, 1-3 socket columns, bulbs.
 */

export const VIEW_W = 360;
/** Vertical pitch of parts in a column; tall boards pack a little tighter. */
const ROW_GAP_ROOMY = 56;
const ROW_GAP_TIGHT = 47;
const MARGIN_Y = 26;
export const SWITCH_X = 25;
export const SWITCH_W = 28;
export const SWITCH_H = 20;
export const BULB_INSET = 26;
export const BULB_R = 11;
/** Sockets slim down on three-column boards so the wires between them stay readable. */
const SOCKET_W_ROOMY = 56;
const SOCKET_W_TIGHT = 47;
export const SOCKET_H = 40;
export const PIN_LEN = 5;
export const PIN_SPREAD = 10;
/** Sideways spacing between wires that turn in the same gap between columns. */
const LANE = 5;
const LANE_START = 6;

export type Point = { x: number; y: number };

export type WireLayout = {
  key: string;
  from: Source;
  /** Socket index the wire ends at, or -1 for a bulb wire. */
  toSocket: number;
  toBulb: number;
  /** Column the wire starts from; drives the animation delay. */
  column: number;
  points: Point[];
  d: string;
  length: number;
};

export type BoardLayout = {
  width: number;
  height: number;
  columns: number;
  socketW: number;
  switches: Point[];
  sockets: Point[];
  bulbs: Point[];
  wires: WireLayout[];
  /** Solder dots where one output splits into several wires. */
  junctions: Point[];
};

const columnYs = (count: number, height: number, gap: number): number[] => {
  const ys: number[] = [];
  for (let i = 0; i < count; i++) {
    ys.push(height / 2 + (i - (count - 1) / 2) * gap);
  }
  return ys;
};

const pathOf = (points: Point[]): { d: string; length: number } => {
  let d = '';
  let length = 0;
  points.forEach((p, i) => {
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    const prev = points[i - 1];
    if (prev) length += Math.hypot(p.x - prev.x, p.y - prev.y);
  });
  return { d, length };
};

const sourceKey = (s: Source): string => `${s.kind}${s.index}`;

export const layoutBoard = (board: Board): BoardLayout => {
  const layers = Math.max(...board.sockets.map((s) => s.layer));
  const perLayer: number[][] = [];
  for (let layer = 1; layer <= layers; layer++) {
    perLayer.push(
      board.sockets
        .map((socket, index) => ({ socket, index }))
        .filter((m) => m.socket.layer === layer)
        .map((m) => m.index)
    );
  }
  const tallest = Math.max(board.inputs, ...perLayer.map((l) => l.length), 2);
  const rowGap = tallest > 3 ? ROW_GAP_TIGHT : ROW_GAP_ROOMY;
  const height = tallest * rowGap + MARGIN_Y * 2 - (rowGap - SOCKET_H);
  const width = VIEW_W;

  // Socket columns sit between the switches and the bulbs with equal gaps for wiring.
  const socketW = layers >= 3 ? SOCKET_W_TIGHT : SOCKET_W_ROOMY;
  const left = SWITCH_X + SWITCH_W / 2;
  const right = width - BULB_INSET - BULB_R;
  const part = socketW + PIN_LEN * 2;
  const gap = (right - left - layers * part) / (layers + 1);
  const socketX = (layer: number): number => left + gap * layer + part * (layer - 0.5);

  const switches = columnYs(board.inputs, height, rowGap).map((y) => ({ x: SWITCH_X, y }));
  const sockets: Point[] = board.sockets.map(() => ({ x: 0, y: 0 }));
  perLayer.forEach((members, l) => {
    const ys = columnYs(members.length, height, rowGap);
    members.forEach((index, row) => {
      sockets[index] = { x: socketX(l + 1), y: ys[row] ?? height / 2 };
    });
  });
  const bulbs = board.bulbs.map((socket) => ({
    x: width - BULB_INSET,
    y: sockets[socket]?.y ?? height / 2,
  }));

  const columnOf = (s: Source): number =>
    s.kind === 'in' ? 0 : (board.sockets[s.index]?.layer ?? 0);
  const outPoint = (s: Source): Point => {
    if (s.kind === 'in') {
      const p = switches[s.index] ?? { x: SWITCH_X, y: height / 2 };
      return { x: p.x + SWITCH_W / 2, y: p.y };
    }
    const p = sockets[s.index] ?? { x: 0, y: 0 };
    return { x: p.x + socketW / 2 + PIN_LEN, y: p.y };
  };
  /** Right edge of a column's parts, where the gap to the next column begins. */
  const columnRight = (column: number): number =>
    column === 0 ? SWITCH_X + SWITCH_W / 2 : socketX(column) + socketW / 2 + PIN_LEN;
  const columnLeft = (column: number): number =>
    column > layers ? width - BULB_INSET - BULB_R : socketX(column) - socketW / 2 - PIN_LEN;

  // Wires from one source turn at the same x inside a gap, so they read as one net.
  const lanes = new Map<string, number>();
  const laneFor = (gap: number, source: Source): number => {
    const key = `${gap}:${sourceKey(source)}`;
    const known = lanes.get(key);
    if (known !== undefined) return known;
    let used = 0;
    for (const k of lanes.keys()) if (k.startsWith(`${gap}:`)) used++;
    lanes.set(key, used);
    return used;
  };

  /**
   * A free horizontal track through a socket column, as close to `want` as
   * possible. Each source gets its own track per column (wires of one net
   * share it), so two skipping nets never run on top of each other.
   */
  const taken = new Map<string, number>();
  const trackThrough = (column: number, want: number, source: Source): number => {
    const key = `${column}:${sourceKey(source)}`;
    const known = taken.get(key);
    if (known !== undefined) return known;
    const ys = (perLayer[column - 1] ?? [])
      .map((i) => sockets[i]?.y ?? 0)
      .sort((a, b) => a - b);
    const first = ys[0] ?? height / 2;
    const last = ys[ys.length - 1] ?? height / 2;
    const tracks = [first - rowGap / 2, last + rowGap / 2];
    for (let i = 1; i < ys.length; i++) tracks.push(((ys[i - 1] ?? 0) + (ys[i] ?? 0)) / 2);
    const used = new Set<number>();
    for (const [k, y] of taken) if (k.startsWith(`${column}:`)) used.add(y);
    const free = tracks.filter((t) => !used.has(t));
    const pool = free.length > 0 ? free : tracks;
    let best = pool[0] ?? want;
    for (const t of pool) if (Math.abs(t - want) < Math.abs(best - want)) best = t;
    taken.set(key, best);
    return best;
  };

  /** One jog inside the gap before `toColumn`: flat, 45-degree diagonal, flat. */
  const jog = (start: Point, end: Point, toColumn: number, source: Source): Point[] => {
    if (Math.abs(start.y - end.y) < 0.5) return [end];
    const gapLeft = Math.max(start.x, columnRight(toColumn - 1));
    const gapRight = Math.min(end.x, columnLeft(toColumn));
    const lane = laneFor(toColumn, source);
    const turn = Math.min(gapLeft + LANE_START + lane * LANE, gapRight - 6);
    const run = Math.min(Math.abs(end.y - start.y), Math.max(4, gapRight - 2 - turn));
    return [{ x: turn, y: start.y }, { x: turn + run, y: end.y }, end];
  };

  const wires: WireLayout[] = [];
  const fanout = new Map<string, { at: Point; count: number }>();

  const addWire = (from: Source, end: Point, toColumn: number, toSocket: number, toBulb: number) => {
    const start = outPoint(from);
    const fromColumn = columnOf(from);
    const points: Point[] = [start];
    let cursor = start;
    if (toColumn - fromColumn > 1) {
      // Skips a socket column: cross it on a free track between the sockets.
      const mid = fromColumn + 1;
      const trackY = trackThrough(mid, (start.y + end.y) / 2, from);
      const across = { x: columnRight(mid), y: trackY };
      points.push(...jog(cursor, { x: columnLeft(mid), y: trackY }, mid, from), across);
      cursor = across;
    }
    points.push(...jog(cursor, end, toColumn, from));
    const { d, length } = pathOf(points);
    wires.push({
      key: `${sourceKey(from)}>${toBulb >= 0 ? `b${toBulb}` : `s${toSocket}`}:${wires.length}`,
      from,
      toSocket,
      toBulb,
      column: fromColumn,
      points,
      d,
      length,
    });
    const first = points[1];
    const entry = fanout.get(sourceKey(from));
    if (entry) entry.count++;
    else if (first) fanout.set(sourceKey(from), { at: first, count: 1 });
  };

  board.sockets.forEach((socket, index) => {
    const centre = sockets[index] ?? { x: 0, y: 0 };
    socket.inputs.forEach((source, pin) => {
      const offset =
        socket.inputs.length === 1 ? 0 : pin === 0 ? -PIN_SPREAD : PIN_SPREAD;
      addWire(
        source,
        { x: centre.x - socketW / 2 - PIN_LEN, y: centre.y + offset },
        socket.layer,
        index,
        -1
      );
    });
  });
  board.bulbs.forEach((socket, bulb) => {
    const at = bulbs[bulb] ?? { x: 0, y: 0 };
    addWire({ kind: 'socket', index: socket }, { x: at.x - BULB_R, y: at.y }, layers + 1, -1, bulb);
  });

  const junctions: Point[] = [];
  for (const { at, count } of fanout.values()) if (count > 1) junctions.push(at);

  return {
    width,
    height,
    columns: layers + 2,
    socketW,
    switches,
    sockets,
    bulbs,
    wires,
    junctions,
  };
};

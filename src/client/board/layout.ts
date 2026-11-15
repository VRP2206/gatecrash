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
/** Extra touch area around a switch. */
export const SWITCH_PAD = 6;
export const BULB_INSET = 26;
export const BULB_R = 11;
/** Sockets slim down on three-column boards so the wires between them stay readable. */
const SOCKET_W_ROOMY = 56;
const SOCKET_W_TIGHT = 47;
export const SOCKET_H = 40;
export const PIN_LEN = 5;
export const PIN_SPREAD = 10;
/** Sideways spacing between the upright runs of different nets in one gap between columns. */
const TRUNK_PITCH = 7;
const TRUNK_PITCH_MIN = 5;
/** Clear space between a column of parts and the nearest upright run. */
const TRUNK_PAD = 8;
/** Narrowest gap between columns, used where every wire runs straight across. */
const CHANNEL_MIN = 18;
/** Spacing of the extra tracks above and below a socket column. */
const TRACK_PITCH = 7;
const TRACK_EDGE = 12;
/** Two level runs closer than this would read as one wire. */
const CLEARANCE = 4.5;
const CORNER = 3;

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

const near = (a: number, b: number): boolean => Math.abs(a - b) < CLEARANCE;
const level = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;

/** Drop points that sit on a straight line between their neighbours. */
const straighten = (points: Point[]): Point[] => {
  const out: Point[] = [];
  for (const p of points) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (b && level(b.x, p.x) && level(b.y, p.y)) continue;
    if (a && b && ((level(a.x, b.x) && level(b.x, p.x)) || (level(a.y, b.y) && level(b.y, p.y)))) {
      out[out.length - 1] = p;
    } else {
      out.push(p);
    }
  }
  return out;
};

/** Cut each right-angle corner with a short diagonal. */
const chamfer = (points: Point[]): Point[] => {
  const out: Point[] = [];
  points.forEach((p, i) => {
    const a = points[i - 1];
    const b = points[i + 1];
    if (!a || !b) {
      out.push(p);
      return;
    }
    const inLen = Math.hypot(p.x - a.x, p.y - a.y);
    const outLen = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(CORNER, inLen / 2, outLen / 2);
    out.push(
      { x: p.x - ((p.x - a.x) / inLen) * r, y: p.y - ((p.y - a.y) / inLen) * r },
      { x: p.x + ((b.x - p.x) / outLen) * r, y: p.y + ((b.y - p.y) / outLen) * r }
    );
  });
  return out;
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

type Dest = { column: number; y: number; toSocket: number; toBulb: number };
type Net = {
  key: string;
  source: Source;
  column: number;
  y: number;
  dests: Dest[];
  /** Last column this net reaches. */
  reach: number;
  /** Level track the net rides through each socket column it passes. */
  tracks: Map<number, number>;
};
/** One net's share of the gap after column `k`: where it comes in and where it must leave. */
type Crossing = { net: Net; entry: number; exits: number[]; top: number; bottom: number };

/**
 * Order the upright runs in one gap, left to right, so no two nets share a
 * level run and as few wires cross as possible. A net coming in at height y
 * must turn before any other net that leaves at y.
 */
const orderTrunks = (items: Crossing[]): Crossing[] => {
  const cost = (order: Crossing[]): number => {
    let total = 0;
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const a = order[i];
        const b = order[j];
        if (!a || !b) continue;
        for (const y of a.exits) {
          if (near(y, b.entry)) total += 1000;
          else if (y > b.top && y < b.bottom) total += 1;
        }
        if (b.entry > a.top + 0.5 && b.entry < a.bottom - 0.5) total += 1;
      }
    }
    return total;
  };
  if (items.length <= 1) return items;
  if (items.length > 7) {
    // Too many to try every order: insert each net where it costs least.
    let order: Crossing[] = [];
    for (const item of items) {
      let best = [item, ...order];
      for (let at = 1; at <= order.length; at++) {
        const trial = [...order.slice(0, at), item, ...order.slice(at)];
        if (cost(trial) < cost(best)) best = trial;
      }
      order = best;
    }
    return order;
  }
  let best = items;
  let bestCost = cost(items);
  const permute = (done: Crossing[], left: Crossing[]) => {
    if (left.length === 0) {
      const c = cost(done);
      if (c < bestCost) {
        best = done;
        bestCost = c;
      }
      return;
    }
    left.forEach((item, i) => permute([...done, item], [...left.slice(0, i), ...left.slice(i + 1)]));
  };
  permute([], items);
  return best;
};

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
  const socketW = layers >= 3 ? SOCKET_W_TIGHT : SOCKET_W_ROOMY;

  // Heights first: the wiring is planned on these before any column gets its x.
  const switchYs = columnYs(board.inputs, height, rowGap);
  const socketYs: number[] = board.sockets.map(() => height / 2);
  perLayer.forEach((members) => {
    const ys = columnYs(members.length, height, rowGap);
    members.forEach((index, row) => {
      socketYs[index] = ys[row] ?? height / 2;
    });
  });

  // Nets: every wire leaving one switch or chip output.
  const nets = new Map<string, Net>();
  const netOf = (source: Source): Net => {
    const key = sourceKey(source);
    const known = nets.get(key);
    if (known) return known;
    const net: Net = {
      key,
      source,
      column: source.kind === 'in' ? 0 : (board.sockets[source.index]?.layer ?? 0),
      y: (source.kind === 'in' ? switchYs[source.index] : socketYs[source.index]) ?? height / 2,
      dests: [],
      reach: 0,
      tracks: new Map(),
    };
    nets.set(key, net);
    return net;
  };
  const order: { net: Net; dest: Dest }[] = [];
  board.sockets.forEach((socket, index) => {
    const centre = socketYs[index] ?? height / 2;
    socket.inputs.forEach((source, pin) => {
      const offset = socket.inputs.length === 1 ? 0 : pin === 0 ? -PIN_SPREAD : PIN_SPREAD;
      const net = netOf(source);
      const dest = { column: socket.layer, y: centre + offset, toSocket: index, toBulb: -1 };
      net.dests.push(dest);
      order.push({ net, dest });
    });
  });
  board.bulbs.forEach((socket, bulb) => {
    const net = netOf({ kind: 'socket', index: socket });
    const dest = { column: layers + 1, y: socketYs[socket] ?? height / 2, toSocket: -1, toBulb: bulb };
    net.dests.push(dest);
    order.push({ net, dest });
  });
  for (const net of nets.values()) net.reach = Math.max(...net.dests.map((d) => d.column));

  // A net that skips a socket column rides its own level track through it:
  // between two sockets, or above or below the column.
  for (let column = 1; column <= layers; column++) {
    const ys = (perLayer[column - 1] ?? []).map((i) => socketYs[i] ?? 0).sort((a, b) => a - b);
    const first = ys[0] ?? height / 2;
    const last = ys[ys.length - 1] ?? height / 2;
    const free: number[] = [];
    for (let i = 1; i < ys.length; i++) free.push(((ys[i - 1] ?? 0) + (ys[i] ?? 0)) / 2);
    for (let y = first - rowGap / 2; y >= TRACK_EDGE; y -= TRACK_PITCH) free.push(y);
    for (let y = last + rowGap / 2; y <= height - TRACK_EDGE; y += TRACK_PITCH) free.push(y);

    // Where every net comes into the gap before this column.
    const entries = [...nets.values()]
      .filter((net) => net.column < column && net.reach >= column)
      .map((net) => ({ net, y: net.tracks.get(column - 1) ?? net.y }));
    const passing = entries
      .filter(({ net }) => net.reach > column)
      .map(({ net, y }) => {
        const ahead = net.dests.filter((d) => d.column > column);
        const to = ahead.reduce((sum, d) => sum + d.y, 0) / Math.max(1, ahead.length);
        return { net, from: y, want: (y + to) / 2 };
      });
    while (free.length < passing.length) free.push(free[free.length - 1] ?? height / 2);

    // Try every way of handing out tracks: stay close to where each net is
    // heading, keep off the height another net comes in at, and don't swap order.
    let best: number[] = [];
    let bestCost = Infinity;
    const assign = (picked: number[], cost: number) => {
      if (cost >= bestCost) return;
      const item = passing[picked.length];
      if (!item) {
        best = picked;
        bestCost = cost;
        return;
      }
      free.forEach((y, i) => {
        if (picked.includes(i)) return;
        let extra = Math.abs(y - item.want);
        if (entries.some((e) => e.net !== item.net && near(e.y, y))) extra += 80;
        picked.forEach((j, n) => {
          const other = passing[n];
          const otherY = free[j] ?? 0;
          if (other && (other.from - item.from) * (otherY - y) < 0) extra += 20;
        });
        assign([...picked, i], cost + extra);
      });
    };
    assign([], 0);
    passing.forEach(({ net, want }, n) => net.tracks.set(column, free[best[n] ?? 0] ?? want));
  }

  // Each gap between columns: which nets need an upright run, and in what order.
  const trunks: Map<string, number>[] = [];
  const crossings: Crossing[][] = [];
  for (let k = 0; k <= layers; k++) {
    const items: Crossing[] = [];
    for (const net of nets.values()) {
      if (net.column > k || net.reach <= k) continue;
      const entry = net.column === k ? net.y : (net.tracks.get(k) ?? net.y);
      const exits = net.dests.filter((d) => d.column === k + 1).map((d) => d.y);
      const through = net.tracks.get(k + 1);
      if (net.reach > k + 1 && through !== undefined) exits.push(through);
      if (exits.every((y) => level(y, entry))) continue;
      items.push({
        net,
        entry,
        exits,
        top: Math.min(entry, ...exits),
        bottom: Math.max(entry, ...exits),
      });
    }
    crossings.push(orderTrunks(items));
  }

  // Columns: gaps grow with the number of upright runs they have to hold.
  const left = SWITCH_X + SWITCH_W / 2;
  const right = width - BULB_INSET - BULB_R;
  const part = socketW + PIN_LEN * 2;
  const room = right - left - layers * part;
  const needs = crossings.map((c) =>
    Math.max(CHANNEL_MIN, TRUNK_PAD * 2 + Math.max(0, c.length - 1) * TRUNK_PITCH)
  );
  const needed = needs.reduce((a, b) => a + b, 0);
  const gaps = needs.map((n) =>
    needed <= room ? n + (room - needed) / needs.length : (n * room) / needed
  );
  const gapStart = (k: number): number => {
    let x = left;
    for (let i = 0; i < k; i++) x += (gaps[i] ?? 0) + part;
    return x;
  };
  const socketX = (layer: number): number => gapStart(layer) - part / 2;
  crossings.forEach((items, k) => {
    const from = gapStart(k);
    const gap = gaps[k] ?? 0;
    const pitch =
      items.length > 1
        ? Math.min(TRUNK_PITCH + 2, Math.max(TRUNK_PITCH_MIN, (gap - TRUNK_PAD * 2) / (items.length - 1)))
        : 0;
    const xs = new Map<string, number>();
    items.forEach((item, i) => {
      xs.set(item.net.key, from + gap / 2 + (i - (items.length - 1) / 2) * pitch);
    });
    trunks.push(xs);
  });

  const switches = switchYs.map((y) => ({ x: SWITCH_X, y }));
  const sockets: Point[] = board.sockets.map((socket, index) => ({
    x: socketX(socket.layer),
    y: socketYs[index] ?? height / 2,
  }));
  const bulbs = board.bulbs.map((socket) => ({
    x: width - BULB_INSET,
    y: socketYs[socket] ?? height / 2,
  }));

  const wires: WireLayout[] = order.map(({ net, dest }, index) => {
    const raw: Point[] = [{ x: gapStart(net.column), y: net.y }];
    let y = net.y;
    for (let k = net.column; k < dest.column; k++) {
      const from = gapStart(k);
      const to = from + (gaps[k] ?? 0);
      const exit = k + 1 === dest.column ? dest.y : (net.tracks.get(k + 1) ?? y);
      const turn = trunks[k]?.get(net.key);
      if (!level(exit, y) && turn !== undefined) raw.push({ x: turn, y }, { x: turn, y: exit });
      raw.push({ x: to, y: exit });
      if (k + 1 < dest.column) raw.push({ x: to + part, y: exit });
      y = exit;
    }
    const points = chamfer(straighten(raw));
    return {
      key: `${net.key}>${dest.toBulb >= 0 ? `b${dest.toBulb}` : `s${dest.toSocket}`}:${index}`,
      from: net.source,
      toSocket: dest.toSocket,
      toBulb: dest.toBulb,
      column: net.column,
      points,
      ...pathOf(points),
    };
  });

  // Solder dots wherever a net branches, so a plain crossing never reads as a join.
  const junctions: Point[] = [];
  crossings.forEach((items, k) => {
    for (const item of items) {
      const x = trunks[k]?.get(item.net.key);
      if (x === undefined) continue;
      const ys = new Set<number>();
      const straight = item.exits.some((y) => level(y, item.entry));
      if (straight || (item.entry > item.top + 0.5 && item.entry < item.bottom - 0.5)) ys.add(item.entry);
      for (const y of item.exits) {
        if (y > item.top + 0.5 && y < item.bottom - 0.5 && !level(y, item.entry)) ys.add(y);
      }
      for (const y of ys) junctions.push({ x, y });
    }
  });

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

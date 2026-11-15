import { CHIP_INFO, type SolvedBoard, type Source } from '../src/shared/types';
import { inputOn, rowCount } from '../src/shared/sim';

const name = (s: Source): string =>
  s.kind === 'in' ? `SW${s.index + 1}` : `U${s.index + 1}`;

/** Plain-text rendering of a board, for eyeballing generator output. */
export const renderBoard = (board: SolvedBoard, solutions: number, candidates: number): string => {
  const lines: string[] = [];
  lines.push(
    `Gatecrash #${board.day}  ${board.date}  ${board.difficulty}  ` +
      `(${board.inputs} switches, ${board.sockets.length} sockets, ${board.bulbs.length} bulbs)`
  );
  const layers = Math.max(...board.sockets.map((s) => s.layer));
  for (let layer = 1; layer <= layers; layer++) {
    const parts = board.sockets
      .map((socket, index) => ({ socket, index }))
      .filter((m) => m.socket.layer === layer)
      .map(
        (m) =>
          `U${m.index + 1}(${m.socket.inputs.map(name).join(',')})=${CHIP_INFO[board.solution[m.index] ?? 'AND'].label}`
      );
    lines.push(`  column ${layer}: ${parts.join('   ')}`);
  }
  lines.push(
    `  bulbs:    ${board.bulbs.map((s, i) => `L${i + 1}<-U${s + 1}`).join('  ')}`
  );
  lines.push(`  tray:     ${board.tray.map((c) => CHIP_INFO[c].label).join(', ')}`);
  lines.push(`  target:   ${'SW'.padEnd(board.inputs + 1)}| bulbs`);
  for (let row = 0; row < rowCount(board.inputs); row++) {
    let ins = '';
    for (let i = 0; i < board.inputs; i++) ins += inputOn(board.inputs, i, row) ? '1' : '0';
    const outs = board.target.map((mask) => ((mask >> row) & 1 ? '*' : '.')).join(' ');
    lines.push(`            ${ins.padEnd(board.inputs + 1)}| ${outs}${row === board.probeRow ? '   <- live row' : ''}`);
  }
  lines.push(`  winning placements: ${solutions}   legal placements: ${candidates}`);
  return lines.join('\n');
};

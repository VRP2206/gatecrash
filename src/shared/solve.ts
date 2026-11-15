import { applyChip, fullMask, inputMask } from './sim';
import { CHIP_INFO, type Board, type ChipType, type FullPlacement } from './types';

export type SolveResult = {
  /** Distinct winning placements (swapping two identical chips is not distinct). */
  solutions: FullPlacement[];
  /** Distinct legal ways to fill every socket from the tray. */
  candidates: number;
};

type Puzzle = Pick<Board, 'inputs' | 'sockets' | 'bulbs' | 'tray' | 'target'>;

/**
 * Brute-force every legal placement. The space is tiny (at most 7 sockets and
 * 6 chip kinds), so no pruning is needed.
 */
export const solve = (board: Puzzle, maxSolutions = Infinity): SolveResult => {
  const full = fullMask(board.inputs);
  const inputs: number[] = [];
  for (let i = 0; i < board.inputs; i++) inputs.push(inputMask(board.inputs, i));

  const kinds: ChipType[] = [];
  const left: number[] = [];
  for (const chip of board.tray) {
    const at = kinds.indexOf(chip);
    if (at === -1) {
      kinds.push(chip);
      left.push(1);
    } else {
      left[at] = (left[at] ?? 0) + 1;
    }
  }

  const masks: number[] = new Array<number>(board.sockets.length).fill(0);
  const placed: ChipType[] = [];
  const solutions: FullPlacement[] = [];
  let candidates = 0;

  const read = (kind: 'in' | 'socket', index: number): number =>
    (kind === 'in' ? inputs[index] : masks[index]) ?? 0;

  const visit = (depth: number): void => {
    const socket = board.sockets[depth];
    if (!socket) {
      candidates++;
      const win = board.bulbs.every(
        (from, bulb) => masks[from] === board.target[bulb]
      );
      if (win && solutions.length < maxSolutions) solutions.push([...placed]);
      return;
    }
    const first = socket.inputs[0];
    const second = socket.inputs[1];
    const a = first ? read(first.kind, first.index) : 0;
    const b = second ? read(second.kind, second.index) : 0;
    for (let k = 0; k < kinds.length; k++) {
      const chip = kinds[k];
      const remaining = left[k] ?? 0;
      if (!chip || remaining <= 0) continue;
      if (CHIP_INFO[chip].arity !== socket.inputs.length) continue;
      left[k] = remaining - 1;
      masks[depth] = applyChip(chip, a, b, full);
      placed.push(chip);
      visit(depth + 1);
      placed.pop();
      left[k] = remaining;
    }
  };

  visit(0);
  return { solutions, candidates };
};

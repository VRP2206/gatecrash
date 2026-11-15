/** npm run board -- --day 12 [--count 10] [--epoch 2026-11-16] [--salt x] */
import { generate } from '../src/shared/generate';
import { solve } from '../src/shared/solve';
import { utcDayIndex } from '../src/shared/day';
import { LEVELS } from '../src/shared/types';
import { renderBoard } from './ascii';

const arg = (flag: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${flag}`);
  return (at !== -1 && process.argv[at + 1]) || fallback;
};

const first = Number(arg('day', '1'));
const count = Number(arg('count', '1'));
const epoch = utcDayIndex(Date.parse(`${arg('epoch', '2026-11-16')}T00:00:00Z`));
const salt = arg('salt', '');

for (let day = first; day < first + count; day++) {
  for (const level of LEVELS) {
    const board = generate({ day, dayIndex: epoch + day - 1, level, salt });
    const { solutions, candidates } = solve(board);
    console.log(renderBoard(board, solutions.length, candidates));
    console.log('');
  }
}

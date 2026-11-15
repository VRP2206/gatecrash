/** npm run stats -- [--days 60] : difficulty spread of generated boards. */
import { generate } from '../src/shared/generate';
import { solve } from '../src/shared/solve';
import { utcDayIndex, weekdayName } from '../src/shared/day';
import { isSolved } from '../src/shared/sim';

const at = process.argv.indexOf('--days');
const days = Number((at !== -1 && process.argv[at + 1]) || '60');
const epoch = utcDayIndex(Date.parse('2026-11-16T00:00:00Z'));

console.log('day  weekday    level      sw sock bulb tray  legal wins live-row-pass');
const started = Date.now();
for (let day = 1; day <= days; day++) {
  const board = generate({ day, dayIndex: epoch + day - 1 });
  const { solutions, candidates } = solve(board);
  if (!isSolved(board, board.solution)) throw new Error(`day ${day}: bad reference`);
  console.log(
    [
      String(day).padStart(3),
      weekdayName(epoch + day - 1).padEnd(10),
      board.difficulty.padEnd(10),
      String(board.inputs).padStart(2),
      String(board.sockets.length).padStart(4),
      String(board.bulbs.length).padStart(4),
      String(board.tray.length).padStart(4),
      String(candidates).padStart(6),
      String(solutions.length).padStart(4),
    ].join(' ')
  );
}
console.log(`\n${days} boards in ${Date.now() - started} ms`);

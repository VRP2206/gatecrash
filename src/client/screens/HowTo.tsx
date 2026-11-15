import { CHIP_INFO, CHIP_TYPES, MAX_CHARGES, type ChipType } from '../../shared/types';
import { ChipGlyph, ChipTable } from '../board/ChipArt';
import { Chevron } from '../board/icons';
import { useBeat } from '../hooks/useBeat';

type Props = {
  /** Chips to explain; today's tray first. */
  chips: ChipType[];
  onBack: () => void;
  onPractice: () => void;
};

export const HowTo = ({ chips, onBack, onPractice }: Props) => {
  const beat = useBeat();
  const order = [...new Set([...chips, ...CHIP_TYPES])];
  return (
    <main className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          <Chevron />
        </button>
        <h1 className="display page-title">How to play</h1>
      </header>

      <ol className="steps">
        <li>Seat a chip in every socket so the bulbs match the test card on every row.</li>
        <li>One row is live: the board shows it for free while you work.</li>
        <li>
          Power tests every row and costs a charge. You have {MAX_CHARGES}. Fewer charges, better
          score.
        </li>
      </ol>

      <h2 className="silk page-sub">The chips</h2>
      <ul className="legend">
        {order.map((chip) => (
          <li key={chip} className={chips.includes(chip) ? '' : 'is-absent'}>
            <ChipGlyph chip={chip} beat={beat} />
            <p>{CHIP_INFO[chip].blurb}</p>
            <ChipTable chip={chip} />
          </li>
        ))}
      </ul>
      <p className="page-lede">
        In each column the top dots are the wires in and the bottom dot is what comes out.
      </p>

      <button type="button" className="link" onClick={onPractice}>
        Replay the practice board
      </button>
    </main>
  );
};

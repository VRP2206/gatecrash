import { useState } from 'react';
import { api, messageOf } from '../api';
import { CHIP_INFO, CHIP_TYPES, MAX_CHARGES, type ChipType } from '../../shared/types';
import { ChipGlyph, ChipTable } from '../board/ChipArt';
import { Chevron } from '../board/icons';
import { useBeat } from '../hooks/useBeat';

type Props = {
  /** Chips to explain; today's tray first. */
  chips: ChipType[];
  loggedIn: boolean;
  /** Called after the player's data has been erased. */
  onForgotten: () => void;
  onBack: () => void;
  onPractice: () => void;
};

export const HowTo = ({ chips, loggedIn, onBack, onPractice, onForgotten }: Props) => {
  const beat = useBeat();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const forget = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api.forget();
      onForgotten();
    } catch (e) {
      setProblem(messageOf(e));
      setBusy(false);
    }
  };
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
        <li>Tap a switch to flip it. The board shows what your chips do with that setting, for free.</li>
        <li>
          Power tests every row and costs a charge. You have {MAX_CHARGES}. Fewer charges, better
          score.
        </li>
        <li>
          Endless is a weekly climb with no clock. A failed test burns a charge; burn five in one
          stage of ten levels and you drop back to the start of it.
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

      {loggedIn && (
        <section className="privacy">
          <h2 className="silk page-sub">Your data</h2>
          <p className="page-lede">
            Gatecrash stores your username, your results and your streak, and nothing else. You can
            erase all of it; this also clears your streak flair.
          </p>
          {asking ? (
            <div className="privacy-actions">
              <button type="button" className="link is-danger" disabled={busy} onClick={() => void forget()}>
                {busy ? 'Erasing…' : 'Yes, erase everything'}
              </button>
              <button type="button" className="link" disabled={busy} onClick={() => setAsking(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" className="link" onClick={() => setAsking(true)}>
              Erase my data
            </button>
          )}
          {problem && <p className="page-lede is-error">{problem}</p>}
        </section>
      )}
    </main>
  );
};

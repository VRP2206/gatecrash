import { CHIP_INFO, type ChipType } from '../../shared/types';
import { ChipGlyph } from './ChipArt';

type Props = {
  tray: { chip: ChipType; total: number; left: number }[];
  hand: ChipType | null;
  locked: boolean;
  beat: number;
  onPick: (chip: ChipType) => void;
};

/** Today's chips. Tap one, then tap a socket. */
export const Tray = ({ tray, hand, locked, beat, onPick }: Props) => (
  <section className={`tray ${tray.length > 4 ? 'is-crowded' : ''}`} aria-label="Chip tray">
    {tray.map(({ chip, left }) => (
      <button
        key={chip}
        type="button"
        className={`tray-chip ${hand === chip ? 'is-held' : ''} ${left === 0 ? 'is-out' : ''}`}
        disabled={locked || left === 0}
        aria-pressed={hand === chip}
        aria-label={`${CHIP_INFO[chip].label}: ${CHIP_INFO[chip].blurb} ${left} left.`}
        onClick={() => onPick(chip)}
      >
        <ChipGlyph chip={chip} beat={beat} bare />
        <span className="tray-name" aria-hidden="true">
          {CHIP_INFO[chip].label}
        </span>
        {left > 1 && (
          <span className="tray-count" aria-hidden="true">
            ×{left}
          </span>
        )}
      </button>
    ))}
  </section>
);

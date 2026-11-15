import type { PointerEvent } from 'react';
import { CHIP_INFO, type ChipType } from '../../shared/types';
import { ChipGlyph } from './ChipArt';

type Props = {
  tray: { chip: ChipType; total: number; left: number }[];
  hand: ChipType | null;
  locked: boolean;
  beat: number;
  onPick: (chip: ChipType) => void;
  onGrab: (event: PointerEvent, chip: ChipType) => void;
};

/** Today's chips. Tap one then a socket, or drag it straight onto the board. */
export const Tray = ({ tray, hand, locked, beat, onPick, onGrab }: Props) => (
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
        onPointerDown={(event) => onGrab(event, chip)}
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

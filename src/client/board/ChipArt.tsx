import { chipOutput } from '../../shared/sim';
import { CHIP_INFO, type ChipType } from '../../shared/types';

/** Input pairs a chip glyph cycles through, one per beat. */
const BEATS: readonly (readonly [boolean, boolean])[] = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];

const lines = (chip: ChipType): string[] => CHIP_INFO[chip].label.split(' ');

type BodyProps = {
  chip: ChipType;
  /** Centre of the body. */
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
};

/** The black IC package: body, pin-1 notch and etched label. Drawn in the caller's SVG. */
export const ChipBody = ({ chip, x, y, w, h, fontSize }: BodyProps) => {
  const text = lines(chip);
  const leading = fontSize * 1.05;
  const first = y - ((text.length - 1) * leading) / 2;
  return (
    <g className="chip">
      <rect className="chip-body" x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2} />
      <rect className="chip-top" x={x - w / 2 + 2} y={y - h / 2 + 2} width={w - 4} height={h * 0.34} rx={1} />
      <path
        className="chip-notch"
        d={`M${x - w / 2} ${y - 4}a4 4 0 0 1 0 8z`}
      />
      {fontSize > 0 && text.map((line, i) => (
        <text
          key={line}
          className="chip-label"
          x={x + 2}
          y={first + i * leading}
          fontSize={fontSize}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {line}
        </text>
      ))}
    </g>
  );
};

type GlyphProps = {
  chip: ChipType;
  /** 0-3: which input pair to show. */
  beat: number;
  /** Leave the name off the package (the tray prints it underneath instead). */
  bare?: boolean;
  className?: string;
};

/**
 * A chip that demonstrates itself: its own legs light up. Wires in on the
 * left, result out on the right, stepping through every input pair.
 */
export const ChipGlyph = ({ chip, beat, bare = false, className = '' }: GlyphProps) => {
  const two = CHIP_INFO[chip].arity === 2;
  const pair = BEATS[beat % BEATS.length] ?? BEATS[0];
  const a = two ? (pair?.[0] ?? false) : beat % 2 === 1;
  const b = two ? (pair?.[1] ?? false) : false;
  const out = chipOutput(chip, a, b);
  const leg = (x1: number, x2: number, y: number, on: boolean, key: string) => (
    <g key={key} className={`leg ${on ? 'is-on' : ''}`}>
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <circle cx={x1 < x2 ? x1 : x2} cy={y} r={3.2} transform={x1 < x2 ? '' : `translate(${x1 - x2} 0)`} />
    </g>
  );
  return (
    <svg className={`chip-glyph ${className}`} viewBox="0 0 72 40" aria-hidden="true">
      {two ? (
        <>
          {leg(5, 14, 13, a, 'a')}
          {leg(5, 14, 27, b, 'b')}
        </>
      ) : (
        leg(5, 14, 20, a, 'a')
      )}
      {leg(67, 58, 20, out, 'out')}
      <ChipBody
        chip={chip}
        x={36}
        y={20}
        w={46}
        h={34}
        fontSize={bare ? 0 : lines(chip).length > 1 ? 9 : 9.5}
      />
    </svg>
  );
};

/** Every case at once, for the legend and for players who prefer no motion. */
export const ChipTable = ({ chip }: { chip: ChipType }) => {
  const two = CHIP_INFO[chip].arity === 2;
  const cases: (readonly [boolean, boolean])[] = two
    ? [...BEATS]
    : [
        [false, false],
        [true, false],
      ];
  return (
    <svg
      className="chip-table"
      viewBox={`0 0 ${cases.length * 18} 34`}
      role="img"
      aria-label={CHIP_INFO[chip].blurb}
    >
      {cases.map(([a, b], i) => {
        const x = i * 18 + 9;
        const out = chipOutput(chip, a, b);
        return (
          <g key={i}>
            <circle className={`dot ${a ? 'is-on' : ''}`} cx={x} cy={5} r={3.2} />
            {two && <circle className={`dot ${b ? 'is-on' : ''}`} cx={x} cy={14} r={3.2} />}
            <path className="table-arrow" d={`M${x} ${two ? 19 : 10}v${two ? 4 : 8}`} />
            <circle className={`dot dot-out ${out ? 'is-on' : ''}`} cx={x} cy={28} r={4} />
          </g>
        );
      })}
    </svg>
  );
};

import { chipOutput } from '../../shared/sim';
import { CHIP_INFO, type ChipType } from '../../shared/types';

/** Input pairs a chip glyph cycles through, one per beat. */
const BEATS: readonly (readonly [boolean, boolean])[] = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];

/*
 * One pictogram per chip, drawn as two overlapping rings: the shaded part is
 * when the chip is on. BOTH shades only the overlap, EITHER shades everything
 * inside, DIFFER leaves the overlap empty; NOT BOTH and NEITHER add a shaded
 * plate behind for "on when nothing is". FLIP is a half-shaded disc. Each chip
 * also has its own colour, but the shapes alone tell them apart.
 */
const LENS = 'M12 3.39A5.5 5.5 0 0 1 12 12.61A5.5 5.5 0 0 1 12 3.39z';

type IconProps = { chip: ChipType; x: number; y: number; scale: number };

/** Drawn in a 24x16 box centred on (x, y). */
export const ChipIcon = ({ chip, x, y, scale }: IconProps) => {
  const rings = (
    <>
      <circle className="icon-ring" cx={9} cy={8} r={5.5} />
      <circle className="icon-ring" cx={15} cy={8} r={5.5} />
    </>
  );
  let art;
  switch (chip) {
    case 'AND':
      art = (
        <>
          <path className="icon-on" d={LENS} />
          {rings}
        </>
      );
      break;
    case 'OR':
      art = (
        <>
          <circle className="icon-on" cx={9} cy={8} r={5.5} />
          <circle className="icon-on" cx={15} cy={8} r={5.5} />
          {rings}
        </>
      );
      break;
    case 'XOR':
      art = (
        <>
          <circle className="icon-on" cx={9} cy={8} r={5.5} />
          <circle className="icon-on" cx={15} cy={8} r={5.5} />
          <path className="icon-off" d={LENS} />
          {rings}
        </>
      );
      break;
    case 'NAND':
      art = (
        <>
          <rect className="icon-on" x={0.5} y={0.5} width={23} height={15} rx={2.5} />
          <path className="icon-off" d={LENS} />
          <circle className="icon-cut" cx={9} cy={8} r={5.5} />
          <circle className="icon-cut" cx={15} cy={8} r={5.5} />
        </>
      );
      break;
    case 'NOR':
      art = (
        <>
          <rect className="icon-on" x={0.5} y={0.5} width={23} height={15} rx={2.5} />
          <circle className="icon-off" cx={9} cy={8} r={5.5} />
          <circle className="icon-off" cx={15} cy={8} r={5.5} />
          <circle className="icon-cut" cx={9} cy={8} r={5.5} />
          <circle className="icon-cut" cx={15} cy={8} r={5.5} />
        </>
      );
      break;
    case 'NOT':
      art = (
        <>
          <path className="icon-on" d="M12 1.5a6.5 6.5 0 0 1 0 13z" />
          <circle className="icon-ring" cx={12} cy={8} r={6.5} />
          <path className="icon-ring" d="M12 1.5v13" />
        </>
      );
      break;
  }
  return (
    <g
      className={`chip-icon is-${chip}`}
      transform={`translate(${x - 12 * scale} ${y - 8 * scale}) scale(${scale})`}
    >
      {art}
    </g>
  );
};

type BodyProps = {
  chip: ChipType;
  /** Centre of the body. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 hides the name and lets the icon fill the package. */
  fontSize: number;
};

/** The black IC package: body, pin-1 notch, pictogram and etched name. Drawn in the caller's SVG. */
export const ChipBody = ({ chip, x, y, w, h, fontSize }: BodyProps) => {
  const named = fontSize > 0;
  return (
    <g className="chip">
      <rect className="chip-body" x={x - w / 2} y={y - h / 2} width={w} height={h} rx={4} />
      <path className="chip-notch" d={`M${x - w / 2} ${y - 4}a4 4 0 0 1 0 8z`} />
      <ChipIcon chip={chip} x={x + 1} y={named ? y - h * 0.16 : y} scale={named ? h / 34 : h / 24} />
      {named && (
        <text
          className="chip-label"
          x={x + 1}
          y={y + h * 0.31}
          fontSize={fontSize}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {CHIP_INFO[chip].label}
        </text>
      )}
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
        fontSize={bare ? 0 : CHIP_INFO[chip].label.length > 6 ? 7 : 8.5}
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

/* Small inline glyphs. Shapes differ as well as colours, so nothing relies on colour alone. */

export const Tick = ({ className = '' }: { className?: string }) => (
  <svg className={`glyph glyph-tick ${className}`} viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 6.5 5 9.5 10 3" />
  </svg>
);

export const Cross = ({ className = '' }: { className?: string }) => (
  <svg className={`glyph glyph-cross ${className}`} viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 3 9 9M9 3 3 9" />
  </svg>
);

export const Bolt = ({ className = '' }: { className?: string }) => (
  <svg className={`glyph glyph-bolt ${className}`} viewBox="0 0 12 16" aria-hidden="true">
    <path d="M7.5 0.5 1.5 9h3.6L4 15.5 10.5 6.5H6.8z" />
  </svg>
);

export const Flame = ({ className = '' }: { className?: string }) => (
  <svg className={`glyph glyph-flame ${className}`} viewBox="0 0 12 16" aria-hidden="true">
    <path d="M6 0.8c.4 2.6 4.2 4.4 4.2 8.6A4.2 4.2 0 0 1 6 15.2a4.2 4.2 0 0 1-4.2-5.8c.4-1.6 1.4-2.4 1.8-3.8.9.7 1.3 1.5 1.4 2.4C5.9 6.3 6.3 3.2 6 0.8z" />
  </svg>
);

export const Chevron = ({ className = '' }: { className?: string }) => (
  <svg className={`glyph glyph-line ${className}`} viewBox="0 0 12 12" aria-hidden="true">
    <path d="M7.5 2 3.5 6l4 4" />
  </svg>
);

export const Arrow = ({ className = '' }: { className?: string }) => (
  <svg className={`glyph glyph-line ${className}`} viewBox="0 0 14 12" aria-hidden="true">
    <path d="M1 6h11M8.5 2.5 12 6l-3.5 3.5" />
  </svg>
);

/** A switch position pip for the test card: raised bar = on, low hollow bar = off. */
export const SwitchPip = ({ on }: { on: boolean }) => (
  <svg className={`pip pip-switch ${on ? 'is-on' : ''}`} viewBox="0 0 10 14" aria-hidden="true">
    <rect className="pip-slot" x="1" y="1" width="8" height="12" rx="1" />
    <rect className="pip-knob" x="2.5" y={on ? 2.5 : 7.5} width="5" height="4" />
  </svg>
);

/** A bulb pip for the test card: filled with rays = should be lit, hollow = should be dark. */
export const BulbPip = ({ on }: { on: boolean }) => (
  <svg className={`pip pip-bulb ${on ? 'is-on' : ''}`} viewBox="0 0 14 14" aria-hidden="true">
    {on && <path className="pip-rays" d="M7 0v2M7 12v2M0 7h2M12 7h2M2 2l1.4 1.4M10.6 10.6 12 12M12 2l-1.4 1.400M3.4 10.6 2 12" />}
    <circle className="pip-dome" cx="7" cy="7" r={on ? 3.6 : 3.2} />
  </svg>
);

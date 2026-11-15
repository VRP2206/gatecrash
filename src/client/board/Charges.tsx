import { MAX_CHARGES } from '../../shared/types';

/** Battery cells: one empties with every Power press. */
export const Charges = ({ used, spending }: { used: number; spending: boolean }) => (
  <div
    className="charges"
    role="img"
    aria-label={`${MAX_CHARGES - used} of ${MAX_CHARGES} charges left`}
  >
    {Array.from({ length: MAX_CHARGES }, (_, i) => {
      const spent = i >= MAX_CHARGES - used;
      const last = spending && i === MAX_CHARGES - used;
      return <span key={i} className={`cell ${spent ? 'is-spent' : ''} ${last ? 'is-draining' : ''}`} />;
    })}
    <span className="cell-cap" />
  </div>
);

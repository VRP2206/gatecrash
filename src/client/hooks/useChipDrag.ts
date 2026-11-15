import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ChipType } from '../../shared/types';

export type Drag = {
  chip: ChipType;
  /** Socket the chip was picked up from, or null when it came from the tray. */
  from: number | null;
  x: number;
  y: number;
  /** Socket under the pointer right now, if any. */
  over: number | null;
};

type Handlers = {
  locked: boolean;
  onDrop: (chip: ChipType, from: number | null, to: number) => void;
  /** A seated chip was dragged back onto the tray. */
  onReturn: (socket: number) => void;
};

/** Pixels the pointer must travel before a press becomes a drag (so taps stay taps). */
const SLOP = 8;

const socketAt = (x: number, y: number): number | null => {
  for (const el of document.elementsFromPoint(x, y)) {
    const holder = el.closest('[data-socket]');
    const index = holder?.getAttribute('data-socket');
    if (index !== null && index !== undefined) return Number(index);
  }
  return null;
};

const overTray = (x: number, y: number): boolean =>
  document.elementsFromPoint(x, y).some((el) => el.closest('.tray') !== null);

/**
 * Drag a chip from the tray (or from a socket) onto a socket. Works with
 * mouse, touch and pen through pointer events; tapping still works because a
 * press only becomes a drag after it has moved a little.
 */
export const useChipDrag = ({ locked, onDrop, onReturn }: Handlers) => {
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<{ chip: ChipType; from: number | null; x: number; y: number; id: number } | null>(null);
  const dragging = useRef(false);
  const swallowClick = useRef(false);
  const handlers = useRef({ onDrop, onReturn });
  useEffect(() => {
    handlers.current = { onDrop, onReturn };
  }, [onDrop, onReturn]);

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const start = press.current;
      if (!start || event.pointerId !== start.id) return;
      if (!dragging.current) {
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < SLOP) return;
        dragging.current = true;
      }
      event.preventDefault();
      setDrag({
        chip: start.chip,
        from: start.from,
        x: event.clientX,
        y: event.clientY,
        over: socketAt(event.clientX, event.clientY),
      });
    };
    const end = (event: globalThis.PointerEvent) => {
      const start = press.current;
      if (!start || event.pointerId !== start.id) return;
      press.current = null;
      if (!dragging.current) return;
      dragging.current = false;
      // The browser still sends a click to the element the press began on.
      swallowClick.current = true;
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 0);
      setDrag(null);
      if (event.type === 'pointercancel') return;
      const to = socketAt(event.clientX, event.clientY);
      if (to !== null) handlers.current.onDrop(start.chip, start.from, to);
      else if (start.from !== null && overTray(event.clientX, event.clientY)) {
        handlers.current.onReturn(start.from);
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  const grab = useCallback(
    (event: PointerEvent, chip: ChipType, from: number | null) => {
      if (locked || (event.pointerType === 'mouse' && event.button !== 0)) return;
      press.current = { chip, from, x: event.clientX, y: event.clientY, id: event.pointerId };
      dragging.current = false;
    },
    [locked]
  );

  /** Wrap a click handler so the click that ends a drag does nothing. */
  const tap = useCallback(
    <A extends unknown[]>(run: (...args: A) => void) =>
      (...args: A) => {
        if (swallowClick.current) return;
        run(...args);
      },
    []
  );

  return { drag, grab, tap };
};

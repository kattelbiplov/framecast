import clsx from 'clsx';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export function usePersistentSize(key: string, initial: number): [number, Dispatch<SetStateAction<number>>] {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(`panel:${key}`));
      return Number.isFinite(v) && v > 0 ? v : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`panel:${key}`, String(Math.round(size)));
    } catch {
      /* storage unavailable */
    }
  }, [key, size]);
  return [size, setSize];
}

export function ResizeHandle({ direction, onResize }: { direction: 'x' | 'y'; onResize(delta: number): void }) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    let last = direction === 'x' ? e.clientX : e.clientY;
    const move = (ev: PointerEvent) => {
      const cur = direction === 'x' ? ev.clientX : ev.clientY;
      onResize(cur - last);
      last = cur;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      role="separator" aria-orientation={direction === 'x' ? 'vertical' : 'horizontal'} onPointerDown={onPointerDown}
      className={clsx('group relative shrink-0 bg-border', direction === 'x' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize')}
    >
      <div className={clsx('absolute z-10 transition group-hover:bg-accent/50', direction === 'x' ? '-left-1 -right-1 inset-y-0' : '-top-1 -bottom-1 inset-x-0')} />
    </div>
  );
}

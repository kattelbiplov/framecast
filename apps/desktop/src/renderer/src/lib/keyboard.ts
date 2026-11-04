import { useEffect } from 'react';

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

type Binding = { key: string; mod?: boolean; shift?: boolean; handler: (e: KeyboardEvent) => void };

/** Window-level shortcuts that never fire while the user types in a field. */
export function useShortcuts(bindings: Binding[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      for (const b of bindings) {
        if (e.key.toLowerCase() !== b.key.toLowerCase()) continue;
        if (!!b.mod !== mod || !!b.shift !== e.shiftKey) continue;
        e.preventDefault();
        b.handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindings, enabled]);
}

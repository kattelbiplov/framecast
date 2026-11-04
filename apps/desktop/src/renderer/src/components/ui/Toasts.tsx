import clsx from 'clsx';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useApp } from '../../stores/app';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={clsx('pointer-events-auto flex items-start gap-2 rounded-xl border bg-panel px-3 py-2.5 text-xs shadow-xl', t.kind === 'error' ? 'border-danger/40' : 'border-border')}>
          {t.kind === 'error' ? <TriangleAlert size={15} className="mt-px shrink-0 text-danger" /> : t.kind === 'success' ? <CheckCircle2 size={15} className="mt-px shrink-0 text-emerald-500" /> : <Info size={15} className="mt-px shrink-0 text-accent" />}
          <p className="flex-1 leading-relaxed">{t.message}</p>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

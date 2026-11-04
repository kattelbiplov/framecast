import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

/** Small "name this" dialog (Electron does not implement window.prompt). */
export function PromptDialog({ open, onOpenChange, title, description, label, initial = '', confirmLabel = 'Save', onConfirm }: {
  open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; label: string; initial?: string; confirmLabel?: string; onConfirm(value: string): void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!value.trim()} onClick={submit}>{confirmLabel}</Button></>}>
      <form className="p-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input autoFocus aria-label={label} placeholder={label} value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-raised px-3 text-sm" />
      </form>
    </Dialog>
  );
}

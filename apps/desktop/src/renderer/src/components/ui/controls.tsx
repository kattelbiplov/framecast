import * as RadixSlider from '@radix-ui/react-slider';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export function Section({ title, children, defaultOpen = true, actions }: { title: string; children: ReactNode; defaultOpen?: boolean; actions?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border last:border-b-0">
      <div className="flex items-center px-3 h-9">
        <button type="button" className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted hover:text-fg" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown size={14} className={clsx('transition', !open && '-rotate-90')} />
          {title}
        </button>
        {actions}
      </div>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
      <span className="text-muted truncate" title={hint ?? label}>{label}</span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

export function Slider({ value, min, max, step = 0.01, onChange, format, label }: {
  value: number; min: number; max: number; step?: number; onChange(v: number): void; format?: (v: number) => string; label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <RadixSlider.Root
        className="relative flex h-4 flex-1 touch-none select-none items-center"
        value={[value]} min={min} max={max} step={step} aria-label={label}
        onValueChange={([v]) => v !== undefined && onChange(v)}
      >
        <RadixSlider.Track className="relative h-1 flex-1 rounded-full bg-border">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="block h-3.5 w-3.5 rounded-full bg-white shadow ring-1 ring-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
      </RadixSlider.Root>
      <span className="w-10 text-right tabular-nums text-2xs text-muted">{format ? format(value) : value.toFixed(step < 1 ? 2 : 0)}</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={clsx('relative h-5 w-9 rounded-full transition', checked ? 'bg-accent' : 'bg-border')}
    >
      <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

export function Select<T extends string>({ value, options, onChange, label, className }: {
  value: T; options: readonly { value: T; label: string }[]; onChange(v: T): void; label: string; className?: string;
}) {
  return (
    <select
      aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}
      className={clsx('h-7 w-full rounded-md border border-border bg-raised px-2 text-xs text-fg', className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: readonly { value: T; label: ReactNode; title?: string }[]; onChange(v: T): void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-raised p-0.5 border border-border">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx('flex-1 rounded px-2 py-1 text-xs transition', value === o.value ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorInput({ value, onChange, label }: { value: string; onChange(v: string): void; label: string }) {
  const id = useId();
  const hex = /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : '#000000';
  return (
    <div className="flex items-center gap-1.5">
      <input id={id} type="color" aria-label={label} value={hex} onChange={(e) => onChange(e.target.value)} className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5" />
      <input aria-label={`${label} value`} value={value} onChange={(e) => onChange(e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-border bg-raised px-2 text-xs font-mono" />
    </div>
  );
}

export function NumberInput({ value, onChange, label, min, max, step = 1, suffix }: {
  value: number; onChange(v: number): void; label: string; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number" aria-label={label} value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0} min={min} max={max} step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
        }}
        className="h-7 w-full rounded-md border border-border bg-raised px-2 text-xs tabular-nums"
      />
      {suffix && <span className="text-2xs text-muted">{suffix}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, label, placeholder, className }: { value: string; onChange(v: string): void; label: string; placeholder?: string; className?: string }) {
  return (
    <input aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={clsx('h-7 w-full rounded-md border border-border bg-raised px-2 text-xs', className)} />
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="text-muted">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="text-xs text-muted">{children}</div>}
    </div>
  );
}

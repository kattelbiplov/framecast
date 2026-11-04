import { ANIMATION_PRESETS, EASING_PRESETS, evaluateKeyframes, upsertKeyframe } from '@framecast/animation';
import { newId, type AnimatableProperty, type AnimationRef, type Easing, type KeyframeTracks, type TimelineItem } from '@framecast/schema';
import { updateItem } from '@framecast/timeline';
import { Diamond, X } from 'lucide-react';
import { animationRef } from '../../editor/factories';
import { useEditor } from '../../stores/editor';
import { IconButton } from '../ui/Button';
import { Field, NumberInput, Section, Select, Slider } from '../ui/controls';

export function usePatch<T extends TimelineItem>(item: T) {
  const applyTimeline = useEditor((s) => s.applyTimeline);
  return (patch: Partial<Omit<T, 'id' | 'type'>>, label = 'Edit', key?: string) =>
    applyTimeline(label, (tl) => updateItem<T>(tl, item.id, patch), key ?? `${label}-${item.id}`);
}

export const EASING_OPTIONS = (Object.keys(EASING_PRESETS) as (keyof typeof EASING_PRESETS)[]).map((k) => ({ value: k, label: k }));

export function EasingSelect({ value, onChange }: { value: Easing; onChange(e: Easing): void }) {
  const v = typeof value === 'string' ? value : value.type === 'spring' ? 'spring' : 'custom';
  return (
    <Select
      label="Easing" value={v}
      options={[...EASING_OPTIONS, { value: 'spring', label: 'spring (bouncy)' }, ...(v === 'custom' ? [{ value: 'custom', label: 'custom bezier' }] : [])]}
      onChange={(next) => {
        if (next === 'spring') onChange({ type: 'spring', stiffness: 170, damping: 18, mass: 1 });
        else if (next !== 'custom') onChange(next as Easing);
      }}
    />
  );
}

const PRESET_OPTIONS = [{ value: '', label: 'None' }, ...ANIMATION_PRESETS.map((p) => ({ value: p.id, label: p.name }))];

export function AnimationEditor({ title, value, onChange }: { title: string; value: AnimationRef | null; onChange(v: AnimationRef | null): void }) {
  return (
    <div className="space-y-2 rounded-lg bg-raised/60 p-2">
      <Field label={title}>
        <Select label={`${title} preset`} value={value?.presetId ?? ''} options={PRESET_OPTIONS} onChange={(id) => onChange(id ? animationRef(id, value ? { durationMs: value.durationMs, direction: value.direction } : {}) : null)} />
      </Field>
      {value && (
        <>
          <Field label="Duration"><Slider label={`${title} duration`} min={100} max={3000} step={50} value={value.durationMs} onChange={(durationMs) => onChange({ ...value, durationMs })} format={(v) => `${(v / 1000).toFixed(2)}s`} /></Field>
          <Field label="Delay"><Slider label={`${title} delay`} min={0} max={2000} step={50} value={value.delayMs} onChange={(delayMs) => onChange({ ...value, delayMs })} format={(v) => `${(v / 1000).toFixed(2)}s`} /></Field>
          <Field label="Speed"><Slider label={`${title} speed`} min={0.25} max={4} step={0.05} value={value.speed} onChange={(speed) => onChange({ ...value, speed })} format={(v) => `${v.toFixed(2)}×`} /></Field>
          <Field label="Direction">
            <Select label={`${title} direction`} value={value.direction} options={[{ value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'none', label: 'None' }]} onChange={(direction) => onChange({ ...value, direction })} />
          </Field>
          <Field label="Easing"><EasingSelect value={value.easing ?? 'easeOutCubic'} onChange={(easing) => onChange({ ...value, easing })} /></Field>
        </>
      )}
    </div>
  );
}

const PROP_LABEL: Partial<Record<AnimatableProperty, string>> = { x: 'Position X', y: 'Position Y', scale: 'Scale', rotation: 'Rotation', opacity: 'Opacity' };

/** Keyframe channels: add a keyframe at the playhead holding the current value, or clear. */
export function KeyframesSection({ item, defaults, onChange }: {
  item: TimelineItem & { keyframes: KeyframeTracks }; defaults: Partial<Record<AnimatableProperty, number>>; onChange(k: KeyframeTracks): void;
}) {
  const playhead = useEditor((s) => s.playhead);
  const local = Math.max(0, Math.min(item.duration, playhead - item.start));
  const inside = playhead >= item.start && playhead <= item.start + item.duration;
  return (
    <Section title="Keyframes" defaultOpen={Object.keys(item.keyframes).length > 0}>
      {!inside && <p className="text-2xs text-muted">Move the playhead over this item to add keyframes.</p>}
      {(Object.keys(defaults) as AnimatableProperty[]).map((prop) => {
        const keys = item.keyframes[prop] ?? [];
        const value = evaluateKeyframes(keys, local, defaults[prop] ?? 0);
        const hasKeyHere = keys.some((k) => Math.abs(k.t - local) < 20);
        return (
          <Field key={prop} label={PROP_LABEL[prop] ?? prop}>
            <div className="flex items-center gap-1">
              <NumberInput label={`${prop} value`} step={prop === 'rotation' ? 1 : 0.01} value={value} onChange={(v) => onChange({ ...item.keyframes, [prop]: upsertKeyframe(keys, { id: newId('kf'), t: local, value: v, easing: 'easeInOut' }) })} />
              <IconButton size="sm" label={`Add ${prop} keyframe`} active={hasKeyHere} disabled={!inside} onClick={() => onChange({ ...item.keyframes, [prop]: upsertKeyframe(keys, { id: newId('kf'), t: local, value, easing: 'easeInOut' }) })}>
                <Diamond size={12} fill={hasKeyHere ? 'currentColor' : 'none'} />
              </IconButton>
              {keys.length > 0 && (
                <IconButton size="sm" label={`Clear ${prop} keyframes`} onClick={() => {
                  const next = { ...item.keyframes };
                  delete next[prop];
                  onChange(next);
                }}><X size={12} /></IconButton>
              )}
            </div>
          </Field>
        );
      })}
    </Section>
  );
}

import type { ZoomItem } from '@framecast/schema';
import { removeItems, updateItem } from '@framecast/timeline';
import { ZOOM_PRESETS } from '@framecast/zoom';
import clsx from 'clsx';
import { Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useMemo } from 'react';
import { commands } from '../../editor/commands';
import { formatTime } from '../../lib/format';
import { useEditor } from '../../stores/editor';
import { Button, IconButton } from '../ui/Button';
import { Section, Toggle } from '../ui/controls';

export function ZoomPanel() {
  const project = useEditor((s) => s.project)!;
  const hasEvents = useEditor((s) => [...s.recordings.values()].some((r) => r.events.length > 0));
  const selection = useEditor((s) => s.selection);
  const zooms = useMemo(() => project.timeline.tracks.filter((t) => t.kind === 'zoom').flatMap((t) => t.items.filter((i): i is ZoomItem => i.type === 'zoom')), [project.timeline]);
  const applyTimeline = useEditor((s) => s.applyTimeline);

  return (
    <>
      <Section title="Automatic zoom">
        {!hasEvents && <p className="text-2xs text-muted">No interaction data in this project. Auto zoom needs a recording made with click tracking.</p>}
        <div className="grid grid-cols-2 gap-1.5">
          {ZOOM_PRESETS.map((p) => (
            <button key={p.id} type="button" disabled={!hasEvents} title={p.description} onClick={() => commands.regenerateAutoZooms(p.id)}
              className={clsx('rounded-lg border px-2 py-2 text-left transition disabled:opacity-40', project.autoZoom.presetId === p.id ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>
              <p className="text-xs font-medium">{p.name}</p>
              <p className="text-2xs text-muted">{p.scale}× · {(p.transitionInMs / 1000).toFixed(1)}s</p>
            </button>
          ))}
        </div>
        <Button size="sm" className="w-full" icon={<Wand2 size={13} />} disabled={!hasEvents} onClick={() => commands.regenerateAutoZooms(project.autoZoom.presetId)}>Regenerate auto zooms</Button>
        <p className="text-2xs text-muted">Regenerating replaces automatic zooms only; manual zooms are kept.</p>
      </Section>
      <Section title={`Zoom regions (${zooms.length})`} actions={<IconButton size="sm" label="Add zoom at playhead" onClick={commands.addZoom}><Plus size={13} /></IconButton>}>
        {zooms.length === 0 && <p className="text-2xs text-muted">Press Z to add a zoom at the playhead.</p>}
        <ul className="space-y-1">
          {zooms.map((z) => (
            <li key={z.id} className={clsx('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', selection.includes(z.id) ? 'bg-accent/15' : 'hover:bg-raised')}>
              <Toggle label="Enabled" checked={!z.disabled} onChange={(v) => applyTimeline('Toggle zoom', (tl) => updateItem<ZoomItem>(tl, z.id, { disabled: !v }))} />
              <button type="button" className="flex flex-1 items-center gap-1.5 text-left" onClick={() => { useEditor.getState().select([z.id]); useEditor.getState().seek(z.start); }}>
                {z.origin === 'auto' && <Sparkles size={11} className="text-amber-500" />}
                <span className="tabular-nums">{formatTime(z.start)}</span>
                <span className="text-muted">{z.scale.toFixed(1)}× · {(z.duration / 1000).toFixed(1)}s</span>
              </button>
              <IconButton size="sm" label="Delete zoom" onClick={() => applyTimeline('Delete zoom', (tl) => removeItems(tl, [z.id]))}><Trash2 size={12} /></IconButton>
            </li>
          ))}
        </ul>
        {zooms.some((z) => z.origin === 'auto') && (
          <Button size="sm" variant="ghost" className="w-full" onClick={() => applyTimeline('Disable auto zooms', (tl) => ({ ...tl, tracks: tl.tracks.map((t) => ({ ...t, items: t.items.map((i) => (i.type === 'zoom' && i.origin === 'auto' ? { ...i, disabled: true } : i)) })) }))}>
            Disable all automatic zooms
          </Button>
        )}
      </Section>
    </>
  );
}

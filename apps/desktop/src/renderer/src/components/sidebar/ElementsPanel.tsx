import type { ShapeKind } from '@framecast/schema';
import { ArrowUpRight, Circle, EyeOff, Grid3x3, Highlighter, ListOrdered, Minus, MessageSquare, Square, SunDim } from 'lucide-react';
import type { ReactNode } from 'react';
import { commands } from '../../editor/commands';
import { SHAPE_LABELS } from '../../editor/factories';

const GROUPS: { title: string; items: [ShapeKind, ReactNode][] }[] = [
  { title: 'Annotate', items: [['arrow', <ArrowUpRight key="a" size={18} />], ['line', <Minus key="l" size={18} />], ['rectangle', <Square key="r" size={18} />], ['ellipse', <Circle key="e" size={18} />], ['step', <ListOrdered key="s" size={18} />], ['callout', <MessageSquare key="c" size={18} />]] },
  { title: 'Focus', items: [['highlight', <Highlighter key="h" size={18} />], ['spotlight', <SunDim key="sp" size={18} />]] },
  { title: 'Privacy', items: [['blur', <EyeOff key="b" size={18} />], ['pixelate', <Grid3x3 key="p" size={18} />]] },
];

export function ElementsPanel() {
  return (
    <div className="space-y-4 p-3">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">{g.title}</p>
          <div className="grid grid-cols-3 gap-2">
            {g.items.map(([kind, icon]) => (
              <button key={kind} type="button" onClick={() => commands.addShape(kind)} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-border bg-raised/50 text-muted transition hover:border-accent hover:text-fg">
                {icon}
                <span className="text-2xs">{SHAPE_LABELS[kind]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-2xs text-muted">Elements are added at the playhead. Drag them on the preview to position; use the inspector for timing and animation.</p>
    </div>
  );
}

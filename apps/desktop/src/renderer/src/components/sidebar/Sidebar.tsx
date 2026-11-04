import clsx from 'clsx';
import { Captions, FolderOpen, MousePointer2, Palette, Shapes, Sparkles, Type, ZoomIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEditor, type SidebarTab } from '../../stores/editor';
import { AnimationsPanel } from './AnimationsPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { CaptionsPanel } from './CaptionsPanel';
import { CursorPanel } from './CursorPanel';
import { ElementsPanel } from './ElementsPanel';
import { MediaPanel } from './MediaPanel';
import { TextPanel } from './TextPanel';
import { ZoomPanel } from './ZoomPanel';

const TABS: { id: SidebarTab; label: string; icon: ReactNode; panel: () => ReactNode }[] = [
  { id: 'media', label: 'Media', icon: <FolderOpen size={17} />, panel: () => <MediaPanel /> },
  { id: 'zoom', label: 'Zoom', icon: <ZoomIn size={17} />, panel: () => <ZoomPanel /> },
  { id: 'cursor', label: 'Cursor', icon: <MousePointer2 size={17} />, panel: () => <CursorPanel /> },
  { id: 'background', label: 'Style', icon: <Palette size={17} />, panel: () => <BackgroundPanel /> },
  { id: 'text', label: 'Text', icon: <Type size={17} />, panel: () => <TextPanel /> },
  { id: 'captions', label: 'Captions', icon: <Captions size={17} />, panel: () => <CaptionsPanel /> },
  { id: 'animations', label: 'Animate', icon: <Sparkles size={17} />, panel: () => <AnimationsPanel /> },
  { id: 'elements', label: 'Elements', icon: <Shapes size={17} />, panel: () => <ElementsPanel /> },
];

export function Sidebar() {
  const tab = useEditor((s) => s.tab);
  const setTab = useEditor((s) => s.setTab);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]!;
  return (
    <div className="flex h-full border-r border-border bg-panel">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border py-2" aria-label="Editor tools">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={t.id === tab}
            className={clsx('flex w-14 flex-col items-center gap-0.5 rounded-lg py-1.5 text-2xs transition', t.id === tab ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-raised hover:text-fg')}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center border-b border-border px-3 text-xs font-semibold">{active.label}</div>
        <div className="min-h-0 flex-1 overflow-auto">{active.panel()}</div>
      </div>
    </div>
  );
}

import type { AspectRatioPreset } from '@framecast/schema';
import { aspectSize } from '@framecast/compositor';
import { ArrowLeft, Check, CloudOff, LayoutTemplate, Loader2, Redo2, Share, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { commands } from '../../editor/commands';
import { errorMessage } from '../../lib/format';
import { invoke } from '../../lib/ipc';
import { toast, useApp } from '../../stores/app';
import { useEditor } from '../../stores/editor';
import { Button, IconButton } from '../ui/Button';
import { Select } from '../ui/controls';
import { PromptDialog } from '../ui/PromptDialog';

const ASPECTS: { value: AspectRatioPreset; label: string }[] = [
  { value: '16:9', label: '16:9 Landscape' }, { value: '9:16', label: '9:16 Vertical' }, { value: '1:1', label: '1:1 Square' },
  { value: '4:5', label: '4:5 Portrait' }, { value: '4:3', label: '4:3 Classic' },
];

export function TopBar({ onExport }: { onExport(): void }) {
  const navigate = useApp((s) => s.navigate);
  const project = useEditor((s) => s.project)!;
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const saveState = useEditor((s) => s.saveState);
  const apply = useEditor((s) => s.apply);
  const [name, setName] = useState(project.name);
  const [templateOpen, setTemplateOpen] = useState(false);

  const commitName = () => {
    const n = name.trim();
    if (n && n !== project.name) apply('Rename project', (p) => ({ ...p, name: n }));
    else setName(project.name);
  };

  return (
    <header className="drag-region flex h-12 shrink-0 items-center gap-2 border-b border-border bg-panel pl-20 pr-3">
      <div className="no-drag flex items-center gap-1">
        <IconButton label="Back to library" onClick={() => navigate({ name: 'home' })}><ArrowLeft size={16} /></IconButton>
        <input
          aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="h-7 w-56 rounded-md bg-transparent px-2 text-sm font-medium hover:bg-raised focus:bg-raised"
        />
        <span className="flex items-center gap-1 text-2xs text-muted" aria-live="polite">
          {saveState === 'saving' && <><Loader2 size={11} className="animate-spin" /> Saving</>}
          {saveState === 'saved' && <><Check size={11} /> Saved</>}
          {saveState === 'dirty' && <>Edited</>}
          {saveState === 'error' && <span className="flex items-center gap-1 text-danger"><CloudOff size={11} /> Not saved</span>}
        </span>
      </div>
      <div className="flex-1" />
      <div className="no-drag flex items-center gap-1">
        <IconButton label="Undo" disabled={!canUndo} onClick={commands.undo}><Undo2 size={16} /></IconButton>
        <IconButton label="Redo" disabled={!canRedo} onClick={commands.redo}><Redo2 size={16} /></IconButton>
        <IconButton label="Save look as template" onClick={() => setTemplateOpen(true)}><LayoutTemplate size={16} /></IconButton>
        <PromptDialog open={templateOpen} onOpenChange={setTemplateOpen} title="Save as template" label="Template name" initial={`${project.name} style`}
          description="Saves the canvas, background, frame, cursor, zoom, caption and export settings — not your media."
          onConfirm={(n) => void invoke('templates:save', n, useEditor.getState().project!).then(() => toast('success', `Template “${n}” saved`)).catch((e) => toast('error', errorMessage(e)))} />
        <div className="mx-2 w-40">
          <Select label="Aspect ratio" value={project.canvas.aspect === 'custom' ? '16:9' : project.canvas.aspect} options={ASPECTS} onChange={(aspect) =>
            apply('Change aspect ratio', (p) => ({ ...p, canvas: { ...p.canvas, aspect, size: aspectSize(aspect, aspect === '9:16' || aspect === '4:5' ? 1920 : 1080) } }))
          } />
        </div>
        <Button variant="primary" icon={<Share size={14} />} onClick={onExport}>Export</Button>
      </div>
    </header>
  );
}

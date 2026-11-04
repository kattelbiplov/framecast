import type { Asset } from '@framecast/schema';
import { Film, Image as ImageIcon, Music, Plus, Upload } from 'lucide-react';
import { insertItem } from '../../editor/commands';
import { makeClip, makeShape } from '../../editor/factories';
import { errorMessage, formatDuration } from '../../lib/format';
import { invoke } from '../../lib/ipc';
import { toast } from '../../stores/app';
import { useEditor } from '../../stores/editor';
import { Button, IconButton } from '../ui/Button';
import { EmptyState } from '../ui/controls';

export function MediaPanel() {
  const project = useEditor((s) => s.project)!;
  const addAssets = useEditor((s) => s.addAssets);

  const importMedia = async () => {
    try {
      const { assets, mediaUrls } = await invoke('project:importMedia', project.id);
      if (assets.length) addAssets(assets, mediaUrls);
    } catch (e) {
      toast('error', errorMessage(e));
    }
  };

  const addToTimeline = (a: Asset) => {
    const t = useEditor.getState().playhead;
    if (a.role === 'image') {
      insertItem('graphics', makeShape('image', t, { assetId: a.id, from: { x: 0.3, y: 0.3 }, to: { x: 0.7, y: 0.7 }, animationIn: null }), 'Add image');
      return;
    }
    const audio = a.role === 'audio' || a.role === 'music' || a.role === 'microphone' || a.role === 'systemAudio';
    insertItem(audio ? 'audio' : 'video', makeClip(a.id, t, a.durationMs ?? 5000), 'Add clip');
  };

  return (
    <div className="p-3 space-y-3">
      <Button className="w-full" icon={<Upload size={14} />} onClick={() => void importMedia()}>Import media</Button>
      {project.assets.length === 0 ? (
        <EmptyState icon={<Film size={24} />} title="No media yet">Import video, audio (e.g. background music) or images.</EmptyState>
      ) : (
        <ul className="space-y-1">
          {project.assets.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-raised">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-muted">
                {a.role === 'image' ? <ImageIcon size={15} /> : a.mimeType.startsWith('audio') ? <Music size={15} /> : <Film size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">{a.name}</p>
                <p className="text-2xs capitalize text-muted">{a.role}{a.durationMs ? ` · ${formatDuration(a.durationMs)}` : ''}{a.size ? ` · ${a.size.width}×${a.size.height}` : ''}</p>
              </div>
              <IconButton size="sm" label="Add at playhead" className="opacity-0 group-hover:opacity-100" onClick={() => addToTimeline(a)}><Plus size={13} /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

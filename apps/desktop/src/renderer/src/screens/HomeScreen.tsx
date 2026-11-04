import { createProject } from '@framecast/schema';
import { Clapperboard, FolderOpen, LayoutTemplate, MoreHorizontal, Plus, Settings, Trash2, Video, History as HistoryIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { LibraryEntry, RecoveryEntry } from '../../../shared/ipc';
import { TEMPLATES } from '../app/templates';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/controls';
import { errorMessage, formatDuration, relativeDate } from '../lib/format';
import { invoke } from '../lib/ipc';
import { toast, useApp } from '../stores/app';

export function HomeScreen() {
  const navigate = useApp((s) => s.navigate);
  const info = useApp((s) => s.info);
  const [projects, setProjects] = useState<LibraryEntry[] | null>(null);
  const [recoveries, setRecoveries] = useState<RecoveryEntry[]>([]);

  const refresh = useCallback(() => {
    void invoke('library:list').then(setProjects).catch((e) => toast('error', errorMessage(e)));
    void invoke('recording:recoveries').then((r) => setRecoveries(r ?? []));
  }, []);
  useEffect(refresh, [refresh]);

  const createFromTemplate = async (templateId: string) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId)!;
    try {
      const opened = await invoke('project:create', tpl.name);
      await invoke('project:save', tpl.apply(opened.project));
      navigate({ name: 'editor', projectId: opened.project.id });
    } catch (e) {
      toast('error', errorMessage(e));
    }
  };

  const recover = async (r: RecoveryEntry) => {
    try {
      const id = await invoke('recording:recover', r.sessionId);
      if (id) navigate({ name: 'editor', projectId: id });
    } catch (e) {
      toast('error', `Recovery failed: ${errorMessage(e)}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 shrink-0 items-center justify-between border-b border-border pl-20 pr-3">
        <div className="flex items-center gap-2 font-semibold">
          <Clapperboard size={16} className="text-accent" /> Framecast
        </div>
        <div className="no-drag flex items-center gap-1">
          <IconButton label="Settings" onClick={() => useApp.getState().setSettingsOpen(true)}><Settings size={16} /></IconButton>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-8 space-y-10">
          {recoveries.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              <HistoryIcon size={18} className="text-amber-500" />
              <div className="flex-1">
                <p className="font-medium">An interrupted recording was found</p>
                <p className="text-xs text-muted">Started {relativeDate(recoveries[0]!.startedAt)}. Framecast saved it as it went — you can recover what was captured.</p>
              </div>
              <Button size="sm" variant="primary" onClick={() => void recover(recoveries[0]!)}>Recover</Button>
              <Button size="sm" variant="ghost" onClick={() => void invoke('recording:discardRecovery', recoveries[0]!.sessionId).then(refresh)}>Discard</Button>
            </div>
          )}

          <section className="grid grid-cols-3 gap-4">
            <button type="button" onClick={() => navigate({ name: 'setup' })} className="group col-span-2 flex items-center gap-5 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-6 text-left text-white shadow-lg transition hover:brightness-110">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20"><Video size={26} /></span>
              <span>
                <span className="block text-lg font-semibold">New recording</span>
                <span className="block text-sm text-white/80">Record your screen, camera and voice. Zooms and cursor effects are added automatically.</span>
              </span>
            </button>
            <div className="flex flex-col gap-2">
              <Button size="lg" icon={<FolderOpen size={16} />} className="flex-1 justify-start" onClick={() => void invoke('project:openDialog').then((o) => o && navigate({ name: 'editor', projectId: o.project.id }))}>
                Open project…
              </Button>
              <Button size="lg" icon={<Plus size={16} />} className="flex-1 justify-start" onClick={() => void invoke('project:create', 'Untitled project').then((o) => navigate({ name: 'editor', projectId: o.project.id }))}>
                Empty project
              </Button>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Recent projects</h2>
            {projects === null ? (
              <div className="h-40 animate-pulse rounded-xl bg-raised" />
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border">
                <EmptyState icon={<Clapperboard size={28} />} title="No projects yet">Make your first recording to get started.</EmptyState>
              </div>
            ) : (
              <ul className="grid grid-cols-4 gap-4">
                {projects.map((p) => (
                  <ProjectCard key={p.id} entry={p} onOpen={() => navigate({ name: 'editor', projectId: p.id })} onChanged={refresh} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><LayoutTemplate size={15} /> Templates</h2>
            <ul className="grid grid-cols-4 gap-4">
              {TEMPLATES.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => void createFromTemplate(t.id)} className="w-full rounded-xl border border-border bg-panel p-3 text-left transition hover:border-accent/60">
                    <TemplatePreview project={t.apply(createProject('preview'))} />
                    <p className="mt-2 text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted">{t.description}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {info && <p className="text-center text-2xs text-muted">Framecast {info.version} · Library: {info.libraryDir} · Capture engine: {info.nativeCapture ? 'ScreenCaptureKit' : 'Chromium (fallback)'}</p>}
        </div>
      </main>
    </div>
  );
}

function TemplatePreview({ project }: { project: ReturnType<typeof createProject> }) {
  const { width, height } = project.canvas.size;
  const ar = width / height;
  return (
    <div className="flex aspect-video items-center justify-center rounded-lg bg-raised">
      <div className="rounded-md bg-gradient-to-br from-indigo-500 to-pink-500 p-[6%]" style={{ height: ar < 1 ? '86%' : undefined, width: ar >= 1 ? (ar > 1.2 ? '80%' : '50%') : undefined, aspectRatio: String(ar) }}>
        <div className="h-full w-full rounded bg-white/90 shadow" />
      </div>
    </div>
  );
}

function ProjectCard({ entry, onOpen, onChanged }: { entry: LibraryEntry; onOpen(): void; onChanged(): void }) {
  const [menu, setMenu] = useState(false);
  return (
    <li className="group relative">
      <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-xl border border-border bg-panel text-left transition hover:border-accent/60">
        <div className="checker aspect-video bg-raised">
          {entry.thumbnailPath ? <img src={entry.thumbnailPath} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted"><Clapperboard size={22} /></div>}
        </div>
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p className="text-2xs text-muted">{formatDuration(entry.durationMs)} · {relativeDate(entry.updatedAt)}</p>
        </div>
      </button>
      <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
        <IconButton label="Project actions" size="sm" className="bg-panel/90" onClick={() => setMenu(!menu)}><MoreHorizontal size={14} /></IconButton>
        {menu && (
          <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-panel p-1 text-xs shadow-xl" onMouseLeave={() => setMenu(false)}>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left hover:bg-raised" onClick={() => void invoke('project:reveal', entry.id)}>Show in Finder</button>
            <button type="button" className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-danger hover:bg-raised" onClick={() => {
              if (confirm(`Move “${entry.name}” to the Trash?`)) void invoke('project:delete', entry.id).then(onChanged).catch((e) => toast('error', errorMessage(e)));
            }}>
              <Trash2 size={12} /> Move to Trash
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

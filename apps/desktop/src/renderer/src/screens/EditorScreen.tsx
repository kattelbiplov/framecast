import { useEffect, useMemo, useState } from 'react';
import { ExportDialog } from '../components/editor/ExportDialog';
import { PreviewPanel } from '../components/editor/PreviewPanel';
import { TopBar } from '../components/editor/TopBar';
import { Inspector } from '../components/inspector/Inspector';
import { Sidebar } from '../components/sidebar/Sidebar';
import { Timeline } from '../components/timeline/Timeline';
import { ResizeHandle, usePersistentSize } from '../components/ui/ResizeHandle';
import { commands } from '../editor/commands';
import { errorMessage } from '../lib/format';
import { invoke, subscribe } from '../lib/ipc';
import { isEditableTarget, useShortcuts } from '../lib/keyboard';
import { toast, useApp } from '../stores/app';
import { useEditor } from '../stores/editor';

export function EditorScreen({ projectId }: { projectId: string }) {
  const loaded = useEditor((s) => s.project?.id === projectId);
  const maximized = useEditor((s) => s.previewMaximized);
  const [exportOpen, setExportOpen] = useState(false);
  const [sidebarW, setSidebarW] = usePersistentSize('sidebar', 300);
  const [inspectorW, setInspectorW] = usePersistentSize('inspector', 300);
  const [timelineH, setTimelineH] = usePersistentSize('timeline', 280);

  useEffect(() => {
    let cancelled = false;
    void invoke('project:open', projectId)
      .then((opened) => !cancelled && useEditor.getState().load(opened))
      .catch((e) => {
        toast('error', `Could not open project: ${errorMessage(e)}`);
        useApp.getState().navigate({ name: 'home' });
      });
    return () => {
      cancelled = true;
      useEditor.getState().close();
    };
  }, [projectId]);

  // Menu commands. Edit commands fall through to native text editing inside inputs.
  useEffect(
    () =>
      subscribe('menu:command', (cmd) => {
        const inField = isEditableTarget(document.activeElement);
        if (cmd === 'undo') return inField ? document.execCommand('undo') : commands.undo();
        if (cmd === 'redo') return inField ? document.execCommand('redo') : commands.redo();
        if (inField && (cmd === 'delete' || cmd === 'toggle-play')) return;
        if (cmd === 'save') void useEditor.getState().save().then(() => toast('success', 'Project saved'));
        else if (cmd === 'export') setExportOpen(true);
        else if (cmd === 'split') commands.split();
        else if (cmd === 'delete') commands.deleteSelection();
        else if (cmd === 'duplicate') commands.duplicate();
        else if (cmd === 'toggle-play') commands.togglePlay();
        else if (cmd === 'add-zoom') commands.addZoom();
        else if (cmd === 'zoom-in-timeline') useEditor.getState().setPxPerSecond(useEditor.getState().pxPerSecond * 1.25);
        else if (cmd === 'zoom-out-timeline') useEditor.getState().setPxPerSecond(useEditor.getState().pxPerSecond / 1.25);
      }),
    [],
  );

  const step = (frames: number) => () => {
    const s = useEditor.getState();
    s.seek(s.playhead + (frames * 1000) / (s.project?.canvas.fps ?? 30));
  };
  const bindings = useMemo(() => [
    { key: ' ', handler: commands.togglePlay },
    { key: 'k', handler: commands.togglePlay },
    { key: 'Backspace', handler: () => commands.deleteSelection() },
    { key: 'Delete', handler: () => commands.deleteSelection() },
    { key: 'Backspace', shift: true, handler: () => commands.deleteSelection(true) },
    { key: 'z', handler: commands.addZoom },
    { key: 's', handler: commands.split },
    { key: 'ArrowLeft', handler: step(-1) },
    { key: 'ArrowRight', handler: step(1) },
    { key: 'ArrowLeft', shift: true, handler: step(-10) },
    { key: 'ArrowRight', shift: true, handler: step(10) },
    { key: 'Home', handler: () => useEditor.getState().seek(0) },
    { key: 'End', handler: () => useEditor.getState().seek(useEditor.getState().duration) },
    { key: 'Escape', handler: () => useEditor.getState().select([]) },
    { key: 'f', handler: () => useEditor.getState().togglePreviewMaximized() },
    // In-browser (no native menu) fallbacks for modifier shortcuts.
    ...(window.framecast ? [] : [
      { key: 'z', mod: true, handler: commands.undo },
      { key: 'z', mod: true, shift: true, handler: commands.redo },
      { key: 'b', mod: true, handler: commands.split },
      { key: 'd', mod: true, handler: commands.duplicate },
    ]),
  ], []);
  useShortcuts(bindings, loaded);

  if (!loaded) return <div className="flex h-full items-center justify-center text-muted">Opening project…</div>;

  return (
    <div className="flex h-full flex-col">
      <TopBar onExport={() => setExportOpen(true)} />
      <div className="flex min-h-0 flex-1">
        {!maximized && (
          <>
            <div style={{ width: sidebarW }} className="shrink-0"><Sidebar /></div>
            <ResizeHandle direction="x" onResize={(d) => setSidebarW((w) => Math.min(520, Math.max(240, w + d)))} />
          </>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewPanel />
        </div>
        {!maximized && (
          <>
            <ResizeHandle direction="x" onResize={(d) => setInspectorW((w) => Math.min(480, Math.max(240, w - d)))} />
            <div style={{ width: inspectorW }} className="shrink-0"><Inspector /></div>
          </>
        )}
      </div>
      {!maximized && (
        <>
          <ResizeHandle direction="y" onResize={(d) => setTimelineH((h) => Math.min(600, Math.max(160, h - d)))} />
          <div style={{ height: timelineH }} className="shrink-0"><Timeline /></div>
        </>
      )}
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}

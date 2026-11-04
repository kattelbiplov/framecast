import { useEffect } from 'react';
import { Toasts } from '../components/ui/Toasts';
import { errorMessage } from '../lib/format';
import { invoke, subscribe } from '../lib/ipc';
import { EditorScreen } from '../screens/EditorScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { RecordingSetupScreen } from '../screens/RecordingSetupScreen';
import { SettingsDialog } from '../screens/SettingsDialog';
import { toast, useApp } from '../stores/app';
import { startRecordingStateSync, useRecording } from '../stores/recording';

export function App() {
  const route = useApp((s) => s.route);
  const ready = useApp((s) => s.settings !== null);
  const navigate = useApp((s) => s.navigate);

  useEffect(() => {
    void useApp.getState().init().catch((e) => toast('error', errorMessage(e)));
    startRecordingStateSync();
    void invoke('recording:state').then((state) => useRecording.setState({ state }));
  }, []);

  // When a recording finishes, open the generated project in the editor.
  const finishedProject = useRecording((s) => s.state.projectId);
  const recError = useRecording((s) => s.state.error);
  useEffect(() => {
    if (finishedProject) navigate({ name: 'editor', projectId: finishedProject });
  }, [finishedProject, navigate]);
  useEffect(() => {
    if (recError) toast('error', `Recording failed: ${recError}`);
  }, [recError]);

  useEffect(() => {
    const offs = [
      subscribe('shortcut:toggleRecording', () => navigate({ name: 'setup' })),
      subscribe('menu:command', (cmd) => {
        if (cmd === 'new-recording') navigate({ name: 'setup' });
        else if (cmd === 'home') navigate({ name: 'home' });
        else if (cmd === 'preferences') useApp.getState().setSettingsOpen(true);
        else if (cmd === 'open-project') {
          void invoke('project:openDialog')
            .then((o) => o && navigate({ name: 'editor', projectId: o.project.id }))
            .catch((e) => toast('error', errorMessage(e)));
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [navigate]);

  if (!ready) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;
  return (
    <>
      {route.name === 'home' && <HomeScreen />}
      {route.name === 'setup' && <RecordingSetupScreen />}
      {route.name === 'editor' && <EditorScreen key={route.projectId} projectId={route.projectId} />}
      <SettingsDialog />
      <Toasts />
    </>
  );
}

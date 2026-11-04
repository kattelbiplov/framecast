import { Button } from '../components/ui/Button';
import { Field, Section, Segmented, TextInput, Toggle } from '../components/ui/controls';
import { Dialog } from '../components/ui/Dialog';
import { useApp } from '../stores/app';

export function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen);
  const setOpen = useApp((s) => s.setSettingsOpen);
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  if (!settings) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Settings" footer={<Button variant="primary" onClick={() => setOpen(false)}>Done</Button>}>
      <Section title="Appearance">
        <Field label="Theme">
          <Segmented label="Theme" value={settings.theme} onChange={(theme) => void update({ theme })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Field>
      </Section>
      <Section title="Shortcuts">
        <Field label="Start / stop"><TextInput label="Start or stop recording shortcut" value={settings.shortcuts.startStopRecording} onChange={(v) => void update({ shortcuts: { ...settings.shortcuts, startStopRecording: v } })} /></Field>
        <Field label="Pause / resume"><TextInput label="Pause or resume shortcut" value={settings.shortcuts.pauseResumeRecording} onChange={(v) => void update({ shortcuts: { ...settings.shortcuts, pauseResumeRecording: v } })} /></Field>
      </Section>
      <Section title="Privacy">
        <Field label="Track clicks"><Toggle label="Track interactions" checked={settings.recording.trackInteractions} onChange={(v) => void update({ recording: { ...settings.recording, trackInteractions: v } })} /></Field>
        <Field label="Shortcuts" hint="Only modifier combinations (⌘/⌃/⌥) are ever stored"><Toggle label="Track shortcuts" checked={settings.recording.trackShortcuts} onChange={(v) => void update({ recording: { ...settings.recording, trackShortcuts: v } })} /></Field>
        <Field label="Hide apps" hint="Bundle IDs excluded from capture (native engine), comma separated">
          <TextInput label="Excluded bundle IDs" placeholder="com.1password.1password, com.apple.keychainaccess" value={settings.recording.excludedBundleIds.join(', ')} onChange={(v) => void update({ recording: { ...settings.recording, excludedBundleIds: v.split(',').map((s) => s.trim()).filter(Boolean) } })} />
        </Field>
      </Section>
      <Section title="Tools">
        <Field label="ffmpeg path"><TextInput label="ffmpeg path" placeholder="Auto-detect" value={settings.ffmpegPath ?? ''} onChange={(v) => void update({ ffmpegPath: v || null })} /></Field>
        <Field label="whisper.cpp"><TextInput label="whisper.cpp binary" placeholder="Auto-detect whisper-cli" value={settings.transcription.whisperBinaryPath ?? ''} onChange={(v) => void update({ transcription: { ...settings.transcription, whisperBinaryPath: v || null } })} /></Field>
        <Field label="Model"><TextInput label="Whisper model path" placeholder="~/…/ggml-base.en.bin" value={settings.transcription.whisperModelPath ?? ''} onChange={(v) => void update({ transcription: { ...settings.transcription, whisperModelPath: v || null } })} /></Field>
      </Section>
    </Dialog>
  );
}

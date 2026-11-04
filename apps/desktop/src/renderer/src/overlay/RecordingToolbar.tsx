import clsx from 'clsx';
import { Pause, Play, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RecordingState } from '../../../shared/ipc';
import { formatTime } from '../lib/format';
import { invoke, subscribe } from '../lib/ipc';

/** Compact floating toolbar; its window is excluded from capture via content protection. */
export function RecordingToolbar() {
  const [state, setState] = useState<RecordingState | null>(null);
  useEffect(() => {
    void invoke('recording:state').then(setState);
    return subscribe('recording:state', setState);
  }, []);
  if (!state) return null;
  const paused = state.phase === 'paused';

  if (state.phase === 'countdown') {
    return (
      <div className="drag-region flex h-screen items-center justify-center">
        <div className="flex items-center gap-3 rounded-full bg-black/85 px-5 py-2 text-white shadow-2xl ring-1 ring-white/10">
          <span className="text-2xl font-bold tabular-nums">{state.countdownRemaining}</span>
          <span className="text-xs text-white/70">Recording starts…</span>
          <button type="button" className="no-drag rounded-full px-2 py-1 text-xs text-white/70 hover:bg-white/10" onClick={() => void invoke('recording:cancel')}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="drag-region flex h-screen items-center justify-center">
      <div className="flex items-center gap-1 rounded-full bg-black/85 py-1.5 pl-4 pr-1.5 text-white shadow-2xl ring-1 ring-white/10">
        <span className={clsx('mr-1 h-2.5 w-2.5 rounded-full', paused ? 'bg-amber-400' : 'bg-red-500 animate-pulse')} aria-hidden />
        <span className="mr-2 w-14 font-mono text-sm tabular-nums" aria-label="Recording duration">{formatTime(state.elapsedMs)}</span>
        {state.phase === 'finalizing' ? (
          <span className="px-3 text-xs text-white/70">Saving…</span>
        ) : (
          <>
            <ToolbarButton label={paused ? 'Resume' : 'Pause'} onClick={() => void invoke(paused ? 'recording:resume' : 'recording:pause')}>
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </ToolbarButton>
            <ToolbarButton label="Discard recording" onClick={() => confirm('Discard this recording?') && void invoke('recording:cancel')}><Trash2 size={15} /></ToolbarButton>
            <button type="button" onClick={() => void invoke('recording:stop')} className="no-drag ml-1 flex h-8 items-center gap-1.5 rounded-full bg-red-500 px-3 text-xs font-semibold hover:bg-red-600">
              <Square size={11} fill="currentColor" /> Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="no-drag flex h-8 w-8 items-center justify-center rounded-full text-white/85 hover:bg-white/10">
      {children}
    </button>
  );
}

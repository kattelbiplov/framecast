import { create } from 'zustand';
import type { RecordingState } from '../../../shared/ipc';
import { subscribe } from '../lib/ipc';

const IDLE: RecordingState = { phase: 'idle', sessionId: null, engine: null, elapsedMs: 0, countdownRemaining: 0, error: null, projectId: null };

export const useRecording = create<{ state: RecordingState }>(() => ({ state: IDLE }));

let started = false;
export function startRecordingStateSync(): void {
  if (started) return;
  started = true;
  subscribe('recording:state', (state) => useRecording.setState({ state }));
}

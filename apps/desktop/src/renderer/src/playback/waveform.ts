import { useEffect, useState } from 'react';

/** Peak amplitude (0..1) per bucket at PEAKS_PER_SECOND. */
export const PEAKS_PER_SECOND = 50;
const cache = new Map<string, Promise<Float32Array>>();

async function computePeaks(url: string): Promise<Float32Array> {
  const data = await (await fetch(url)).arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buffer = await ctx.decodeAudioData(data);
  const bucket = Math.max(1, Math.floor(buffer.sampleRate / PEAKS_PER_SECOND));
  const n = Math.ceil(buffer.length / bucket);
  const peaks = new Float32Array(n);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const samples = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      let max = 0;
      const end = Math.min(samples.length, (i + 1) * bucket);
      for (let j = i * bucket; j < end; j++) {
        const v = Math.abs(samples[j]!);
        if (v > max) max = v;
      }
      if (max > peaks[i]!) peaks[i] = max;
    }
  }
  return peaks;
}

export function useWaveform(url: string | undefined, enabled: boolean): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    if (!url || !enabled) return;
    let alive = true;
    let p = cache.get(url);
    if (!p) {
      p = computePeaks(url);
      cache.set(url, p);
    }
    p.then((v) => alive && setPeaks(v)).catch(() => cache.delete(url));
    return () => {
      alive = false;
    };
  }, [url, enabled]);
  return peaks;
}

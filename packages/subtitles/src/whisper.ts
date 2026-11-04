import type { SubtitleWord } from '@framecast/schema';

/** Subset of whisper.cpp `--output-json-full` output. */
export interface WhisperCppJson {
  result?: { language?: string };
  transcription: {
    offsets: { from: number; to: number };
    text: string;
    tokens?: { text: string; offsets: { from: number; to: number }; p?: number }[];
  }[];
}

const SPECIAL = /^\[_.*_\]$|^<\|.*\|>$/;

/**
 * Convert whisper.cpp JSON into word-level timings. Tokens are merged into words on leading
 * whitespace; segments without tokens fall back to evenly distributing words over the segment.
 */
export function wordsFromWhisperCpp(json: WhisperCppJson): SubtitleWord[] {
  const words: SubtitleWord[] = [];
  for (const seg of json.transcription) {
    const tokens = (seg.tokens ?? []).filter((t) => !SPECIAL.test(t.text.trim()) && t.text.length > 0);
    if (tokens.length > 0) {
      let current: (SubtitleWord & { pSum: number; n: number }) | null = null;
      for (const tok of tokens) {
        const startsWord = /^\s/.test(tok.text) || current === null;
        const clean = tok.text.replace(/^\s+/, '');
        if (startsWord) {
          if (current) words.push(finish(current));
          current = { text: clean, start: tok.offsets.from, end: tok.offsets.to, pSum: tok.p ?? 1, n: 1 };
        } else if (current) {
          current.text += clean;
          current.end = tok.offsets.to;
          current.pSum += tok.p ?? 1;
          current.n += 1;
        }
      }
      if (current) words.push(finish(current));
    } else {
      words.push(...distributeWords(seg.text, seg.offsets.from, seg.offsets.to));
    }
  }
  return words.filter((w) => w.text.trim().length > 0);
}

function finish(w: SubtitleWord & { pSum: number; n: number }): SubtitleWord {
  return { text: w.text, start: w.start, end: Math.max(w.end, w.start + 1), confidence: Math.min(1, w.pSum / w.n) };
}

/** Evenly spread words of `text` across [start, end], weighted by character length. */
export function distributeWords(text: string, start: number, end: number): SubtitleWord[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const total = parts.reduce((a, p) => a + p.length, 0) || 1;
  let t = start;
  return parts.map((p) => {
    const d = ((end - start) * p.length) / total;
    const w = { text: p, start: Math.round(t), end: Math.round(t + d) };
    t += d;
    return w;
  });
}

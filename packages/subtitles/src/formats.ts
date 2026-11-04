import { newId, type SubtitleCue } from '@framecast/schema';

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');

export function formatTimestamp(ms: number, sep: ',' | '.'): string {
  const v = Math.max(0, Math.round(ms));
  return `${pad(v / 3_600_000)}:${pad((v / 60_000) % 60)}:${pad((v / 1000) % 60)}${sep}${pad(v % 1000, 3)}`;
}

/** Parses `HH:MM:SS,mmm`, `HH:MM:SS.mmm` and `MM:SS.mmm`. */
export function parseTimestamp(s: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(s.trim());
  if (!m) throw new Error(`Invalid timestamp "${s}"`);
  const [, h = '0', min, sec, frac] = m;
  return Number(h) * 3_600_000 + Number(min) * 60_000 + Number(sec) * 1000 + Number(frac!.padEnd(3, '0'));
}

const ARROW = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/;

function parseBlocks(text: string, isVtt: boolean): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    const timingIndex = lines.findIndex((l) => ARROW.test(l));
    if (timingIndex < 0) continue; // WEBVTT header, NOTE, STYLE blocks
    if (isVtt && /^(NOTE|STYLE|REGION)\b/.test(lines[0]!)) continue;
    const [, a, b] = ARROW.exec(lines[timingIndex]!)!;
    const body = lines
      .slice(timingIndex + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '') // strip VTT/SRT inline tags
      .trim();
    cues.push({ id: newId('cue'), start: parseTimestamp(a!), end: parseTimestamp(b!), text: body, words: [] });
  }
  return cues.sort((x, y) => x.start - y.start);
}

export const parseSrt = (text: string) => parseBlocks(text, false);
export const parseVtt = (text: string) => parseBlocks(text, true);

export function parseSubtitleFile(name: string, text: string): SubtitleCue[] {
  return /\.vtt$/i.test(name) || text.trimStart().startsWith('WEBVTT') ? parseVtt(text) : parseSrt(text);
}

export function toSrt(cues: readonly SubtitleCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${formatTimestamp(c.start, ',')} --> ${formatTimestamp(c.end, ',')}\n${c.text}\n`)
    .join('\n');
}

export function toVtt(cues: readonly SubtitleCue[]): string {
  const body = cues
    .map((c) => `${formatTimestamp(c.start, '.')} --> ${formatTimestamp(c.end, '.')}\n${c.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

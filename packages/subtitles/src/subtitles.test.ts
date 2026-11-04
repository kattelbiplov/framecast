import { CaptionStyle, SubtitleTrack } from '@framecast/schema';
import { describe, expect, it } from 'vitest';
import {
  applyCaptionPreset,
  editCueText,
  evaluateCaption,
  formatTimestamp,
  parseSrt,
  parseVtt,
  segmentWords,
  shiftCues,
  splitCue,
  toSrt,
  toVtt,
  wordsFromWhisperCpp,
} from './index.js';

const SRT = `1
00:00:01,000 --> 00:00:02,500
Hello <i>world</i>

2
00:00:03,000 --> 00:00:04,000
Second line
`;

describe('formats', () => {
  it('round-trips SRT and VTT', () => {
    const cues = parseSrt(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1000, end: 2500, text: 'Hello world' });
    const again = parseVtt(toVtt(cues));
    expect(again.map((c) => [c.start, c.end, c.text])).toEqual(cues.map((c) => [c.start, c.end, c.text]));
    expect(toSrt(cues)).toContain('00:00:01,000 --> 00:00:02,500');
    expect(formatTimestamp(3_723_004, '.')).toBe('01:02:03.004');
  });
});

describe('whisper.cpp parsing', () => {
  it('merges sub-word tokens and skips specials', () => {
    const words = wordsFromWhisperCpp({
      transcription: [{
        offsets: { from: 0, to: 1000 }, text: ' Hello there',
        tokens: [
          { text: '[_BEG_]', offsets: { from: 0, to: 0 } },
          { text: ' Hel', offsets: { from: 0, to: 200 }, p: 0.9 },
          { text: 'lo', offsets: { from: 200, to: 400 }, p: 0.7 },
          { text: ' there', offsets: { from: 500, to: 900 }, p: 1 },
        ],
      }],
    });
    expect(words.map((w) => w.text)).toEqual(['Hello', 'there']);
    expect(words[0]).toMatchObject({ start: 0, end: 400 });
    expect(words[0]!.confidence).toBeCloseTo(0.8);
  });
});

describe('segmentation and editing', () => {
  const words = 'This is the first sentence. And here comes another one after a pause'.split(' ').map((text, i) => ({
    text, start: i * 300 + (i >= 5 ? 1000 : 0), end: i * 300 + 250 + (i >= 5 ? 1000 : 0),
  }));
  it('breaks on sentence ends and pauses', () => {
    const cues = segmentWords(words);
    expect(cues[0]!.text).toBe('This is the first sentence.');
    expect(cues.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBeGreaterThanOrEqual(cues[i - 1]!.end);
  });
  it('edits, shifts and splits cues', () => {
    const [cue] = segmentWords(words);
    expect(editCueText(cue!, 'This is the 1st sentence.').words[3]!.text).toBe('1st');
    expect(editCueText(cue!, 'Short').words).toHaveLength(1);
    expect(shiftCues([cue!], -5000)[0]!.start).toBe(0);
    const [a, b] = splitCue(cue!, 2);
    expect(a.text).toBe('This is');
    expect(b.start).toBe(cue!.words[2]!.start);
  });
});

describe('caption evaluation', () => {
  const track = (preset: CaptionStyle['preset']) =>
    SubtitleTrack.parse({
      id: 's',
      style: applyCaptionPreset(CaptionStyle.parse({}), preset),
      cues: [{ id: 'c', start: 0, end: 3000, text: 'one two three four five six', words: ['one', 'two', 'three', 'four', 'five', 'six'].map((text, i) => ({ text, start: i * 500, end: i * 500 + 450 })) }],
    });

  it('marks active words and pages long cues', () => {
    const f = evaluateCaption(track('social'), 1600)!;
    // social shows 3 words per page; word 4 ("four") is active at 1600ms
    expect(f.lines.flat().map((w) => w.text)).toEqual(['FOUR', 'FIVE', 'SIX']);
    expect(f.lines[0]![0]!.highlighted).toBe(true);
  });

  it('pop hides future words and typewriter reveals characters', () => {
    const pop = evaluateCaption(track('pop'), 600)!.lines.flat();
    expect(pop[2]!.opacity).toBe(0);
    const tw = evaluateCaption(track('typewriter'), 1100)!.lines.flat();
    expect(tw[2]!.visibleChars).toBeGreaterThan(0);
    expect(tw[2]!.visibleChars).toBeLessThan(5);
    expect(tw[3]!.visibleChars).toBe(0);
    expect(evaluateCaption(track('classic'), 5000)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { CaptionStyle, ProjectTemplate, applyTemplate, createProject, extractTemplate } from './index.js';

describe('project templates', () => {
  it('captures the look but not media, and re-applies it', () => {
    const src = createProject('Styled');
    src.frame = { ...src.frame, padding: 0.12, mockup: 'browser' };
    src.canvas = { ...src.canvas, aspect: '9:16', size: { width: 1080, height: 1920 }, background: { type: 'image', assetId: 'ast_x', blurPx: 10 } };
    src.subtitles = [{ id: 's', language: 'en', label: 'EN', visible: true, burnIn: true, source: 'manual', style: CaptionStyle.parse({ preset: 'social' }), cues: [{ id: 'c', start: 0, end: 1, text: 'secret words', words: [] }] }];
    const tpl = extractTemplate(src, '  Shorts  ');
    expect(ProjectTemplate.parse(JSON.parse(JSON.stringify(tpl)))).toEqual(tpl);
    expect(tpl.name).toBe('Shorts');
    expect(tpl.canvas.background.type).toBe('gradient'); // media backgrounds aren't portable
    expect(JSON.stringify(tpl)).not.toContain('secret words');

    const target = createProject('New');
    const applied = applyTemplate(target, tpl);
    expect(applied.frame.mockup).toBe('browser');
    expect(applied.canvas.aspect).toBe('9:16');
    expect(applied.subtitles[0]!.style.preset).toBe('social');
    expect(applied.subtitles[0]!.cues).toEqual([]);
    expect(applied.timeline).toBe(target.timeline);
  });
});

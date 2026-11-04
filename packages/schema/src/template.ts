import { z } from 'zod';
import { ExportSettings } from './export.js';
import { AutoZoomSettings, AudioSettings, CanvasSettings, type Project } from './project.js';
import { Id, newId } from './primitives.js';
import { CursorStyle, FrameStyle, WebcamStyle } from './styling.js';
import { CaptionStyle, SubtitleTrack } from './subtitles.js';

export const TEMPLATE_SCHEMA_VERSION = 1;

/**
 * A reusable *look*: everything about a project except its media, timeline and caption text.
 * Media-backed backgrounds are not portable, so they fall back to the default gradient.
 */
export const ProjectTemplate = z.object({
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  id: Id,
  name: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  canvas: CanvasSettings,
  frame: FrameStyle,
  cursor: CursorStyle,
  webcam: WebcamStyle,
  autoZoom: AutoZoomSettings,
  audio: AudioSettings,
  export: ExportSettings,
  captionStyle: CaptionStyle.nullable(),
});
export type ProjectTemplate = z.infer<typeof ProjectTemplate>;

export function extractTemplate(project: Project, name: string, now = new Date()): ProjectTemplate {
  const bg = project.canvas.background;
  const portableBg = bg.type === 'image' || bg.type === 'video' ? CanvasSettings.parse({}).background : bg;
  return ProjectTemplate.parse({
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: newId('tpl'),
    name: name.trim(),
    createdAt: now.toISOString(),
    canvas: { ...project.canvas, background: portableBg },
    frame: project.frame,
    cursor: project.cursor,
    webcam: project.webcam,
    autoZoom: project.autoZoom,
    audio: project.audio,
    export: project.export,
    captionStyle: project.subtitles[0]?.style ?? null,
  });
}

/** Apply a template's look to a project; media, timeline and captions text are untouched. */
export function applyTemplate(project: Project, t: ProjectTemplate): Project {
  const subtitles = t.captionStyle
    ? project.subtitles.length
      ? project.subtitles.map((s, i) => (i === 0 ? { ...s, style: t.captionStyle! } : s))
      : [SubtitleTrack.parse({ id: newId('sub'), style: t.captionStyle })]
    : project.subtitles;
  return {
    ...project,
    canvas: t.canvas,
    frame: t.frame,
    cursor: t.cursor,
    webcam: t.webcam,
    autoZoom: t.autoZoom,
    audio: t.audio,
    export: t.export,
    subtitles,
  };
}

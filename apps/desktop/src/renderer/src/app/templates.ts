import type { Project } from '@framecast/schema';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  apply(p: Project): Project;
}

export const TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: 'tutorial', name: 'YouTube tutorial', description: '16:9 · gradient · smooth zooms',
    apply: (p) => ({ ...p, canvas: { ...p.canvas, aspect: '16:9', size: { width: 1920, height: 1080 } }, autoZoom: { enabled: true, presetId: 'tutorial' } }),
  },
  {
    id: 'short', name: 'Vertical short', description: '9:16 · social captions · reframed',
    apply: (p) => ({
      ...p,
      canvas: { ...p.canvas, aspect: '9:16', size: { width: 1080, height: 1920 }, reframeFocus: 'cursor' },
      frame: { ...p.frame, padding: 0.04 },
      autoZoom: { enabled: true, presetId: 'fast' },
    }),
  },
  {
    id: 'square', name: 'Square social', description: '1:1 · bold frame · subtle zoom',
    apply: (p) => ({ ...p, canvas: { ...p.canvas, aspect: '1:1', size: { width: 1080, height: 1080 } }, autoZoom: { enabled: true, presetId: 'subtle' } }),
  },
  {
    id: 'product', name: 'Product demo', description: '16:9 · browser mockup · cinematic',
    apply: (p) => ({ ...p, frame: { ...p.frame, mockup: 'browser', padding: 0.08 }, autoZoom: { enabled: true, presetId: 'productDemo' } }),
  },
];

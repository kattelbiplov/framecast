import type { TextItem } from '@framecast/schema';
import { updateItem } from '@framecast/timeline';
import { useEditor } from '../stores/editor';
import { animationRef } from './factories';

export const ANIMATION_DRAG_TYPE = 'application/x-framecast-animation';

/** Apply an animation preset to a text/shape item as its entrance or exit. */
export function applyAnimationToItem(itemId: string, presetId: string, which: 'in' | 'out'): void {
  useEditor.getState().applyTimeline(`Animation ${which}`, (tl) =>
    // TextItem and ShapeItem share the animationIn/animationOut fields.
    updateItem<TextItem>(tl, itemId, which === 'in' ? { animationIn: animationRef(presetId) } : { animationOut: animationRef(presetId, { durationMs: 400 }) }),
  );
}

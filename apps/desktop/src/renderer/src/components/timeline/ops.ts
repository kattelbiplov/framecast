import { TRACK_ACCEPTS, type TimelineItemType, type TrackKind } from '@framecast/schema';

export { collectSnapPoints, moveItem, snap, snapItemStart, trimItem } from '@framecast/timeline';

export const TRACK_ACCEPTS_FOR = (kind: TrackKind, type: TimelineItemType) => TRACK_ACCEPTS[kind].includes(type);

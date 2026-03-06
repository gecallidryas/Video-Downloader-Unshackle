export type StreamCategory =
  | 'direct'
  | 'hls'
  | 'dash'
  | 'hds'
  | 'mss'
  | 'subtitle'
  | 'audio';

export type StreamCategoryMessageKey = `stream.category.${StreamCategory}`;

export const STREAM_CATEGORY_MESSAGES: Record<StreamCategoryMessageKey, string> = {
  'stream.category.direct': 'Direct media',
  'stream.category.hls': 'HLS stream',
  'stream.category.dash': 'DASH stream',
  'stream.category.hds': 'HDS stream',
  'stream.category.mss': 'MSS stream',
  'stream.category.subtitle': 'Subtitle track',
  'stream.category.audio': 'Audio stream',
};

export function streamCategoryMessageKey(
  category: StreamCategory,
): StreamCategoryMessageKey {
  return `stream.category.${category}`;
}

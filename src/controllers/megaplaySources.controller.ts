import { Context } from 'hono';
import * as megaplay from '../services/megaplay';
import { validationError, NotFoundError } from '../utils/errors';

/**
 * GET /api/v2/megaplay/sources/:anilistId?ep=N&category=sub|dub
 * Direct HLS manifest + subtitles (proxied with the megaplay referer).
 */
const megaplaySourcesController = async (c: Context) => {
  const anilistId = c.req.param('anilistId');
  const ep = c.req.query('ep') || '1';
  const category = (c.req.query('category') || 'sub').toLowerCase();

  if (!anilistId) throw new validationError('anilistId is required');
  if (category !== 'sub' && category !== 'dub') throw new validationError('category must be sub or dub');

  const data = await megaplay.sources(anilistId, ep, category);
  if (!data) throw new NotFoundError('no playable MegaPlay source for this episode');

  const proxy = (url: string) =>
    `/api/v2/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(data.referer)}`;

  return {
    category,
    language: category === 'dub' ? 'en-US' : 'ja-JP',
    server: 'MegaPlay',
    sources: [{ url: data.file, type: 'hls', isM3U8: true, proxyUrl: proxy(data.file) }],
    subtitles: data.subtitles.map(t => ({ lang: t.lang, label: t.label, url: t.url, proxyUrl: proxy(t.url) })),
  };
};

export default megaplaySourcesController;

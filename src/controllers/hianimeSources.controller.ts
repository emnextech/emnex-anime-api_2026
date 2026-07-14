import { Context } from 'hono';
import * as hianime from '../services/hianime';
import { validationError, NotFoundError } from '../utils/errors';

/**
 * GET /api/v2/hianime/sources?title=<t>&ep=<n>&server=hd-1&category=sub
 * Resolves a HiAnime server to a direct HLS manifest + subtitles, wrapped through
 * our /proxy with the megacloud referer so it plays cross-origin in our player.
 */
const hianimeSourcesController = async (c: Context) => {
  const title = c.req.query('title');
  const ep = Number(c.req.query('ep')) || 1;
  const server = c.req.query('server') || 'hd-1';
  const category = (c.req.query('category') || 'sub').toLowerCase();

  if (!title) throw new validationError('title is required');
  if (!['sub', 'dub', 'raw'].includes(category)) {
    throw new validationError('category must be sub, dub or raw');
  }

  let data: hianime.HiAnimeSources | null;
  try {
    data = await hianime.sources(title, ep, server, category as 'sub' | 'dub' | 'raw');
  } catch {
    throw new NotFoundError('could not resolve this HiAnime server');
  }
  if (!data || data.sources.length < 1) throw new NotFoundError('no playable HiAnime source');

  const proxy = (url: string) =>
    `/api/v2/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(data!.referer)}`;

  return {
    category: data.category,
    language: data.category === 'dub' ? 'en-US' : 'ja-JP',
    server: data.server,
    sources: data.sources.map(s => ({ ...s, type: 'hls', proxyUrl: proxy(s.url) })),
    subtitles: data.subtitles.map(t => ({ lang: t.lang, label: t.label, url: t.url, proxyUrl: proxy(t.url) })),
    intro: data.intro,
    outro: data.outro,
  };
};

export default hianimeSourcesController;

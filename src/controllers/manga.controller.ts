import { Context } from 'hono';
import * as manga from '../services/manga';
import { validationError } from '../utils/errors';

const pageOf = (c: Context) => Number(c.req.query('page')) || 1;

/** GET /manga/home — featured chapters + trending manga. */
export const mangaHomeController = async () => manga.home();

/** GET /manga/search?q=&page= */
export const mangaSearchController = async (c: Context) => {
  const q = c.req.query('q') || c.req.query('query') || '';
  if (!q.trim()) throw new validationError('q query param is required');
  return manga.search(q, pageOf(c));
};

/** GET /manga/info?id=2/one-piece */
export const mangaInfoController = async (c: Context) => {
  const id = c.req.query('id');
  if (!id) throw new validationError('id query param is required');
  return manga.info(id);
};

/** GET /manga/read?chapterId=2-10001000/one-piece-chapter-1 */
export const mangaReadController = async (c: Context) => {
  const chapterId = c.req.query('chapterId') || c.req.query('id');
  if (!chapterId) throw new validationError('chapterId query param is required');
  return manga.read(chapterId);
};

/** GET /manga/recent?page= */
export const mangaRecentController = async (c: Context) => manga.recent(pageOf(c));

/** GET /manga/new?page= */
export const mangaNewController = async (c: Context) => manga.latest(pageOf(c));

/** GET /manga/trending */
export const mangaTrendingController = async () => ({ results: await manga.trending() });

/** GET /manga/browse?genre=&type=&status=&page= */
export const mangaBrowseController = async (c: Context) =>
  manga.advancedSearch({
    query: c.req.query('q') || '',
    genre: c.req.query('genre') || '',
    type: c.req.query('type') || '',
    status: c.req.query('status') || '',
    page: pageOf(c),
  });

/** GET /manga/genres */
export const mangaGenresController = async () => ({
  genres: manga.GENRES,
  types: manga.TYPES,
  statuses: manga.STATUSES,
});

/**
 * GET /manga/image?url=... — raw image proxy (not wrapped in the JSON envelope).
 * Registered directly on the router like the media proxy.
 */
export const mangaImageController = async (c: Context) => {
  const url = c.req.query('url');
  if (!url) return c.json({ success: false, message: 'url query param is required' }, 400);
  try {
    const { body, contentType } = await manga.proxyImage(url);
    return c.body(body, 200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Access-Control-Allow-Origin': '*',
    });
  } catch {
    return c.json({ success: false, message: 'failed to fetch image' }, 502);
  }
};

import { Context } from 'hono';
import { getTrendingTrailers, getTrailerByTitle, Trailer } from '../services/trailers';

interface TrailersPayload {
  trailers: Trailer[];
  total: number;
}

/**
 * GET /trailers            — trending anime trailers/clips.
 * GET /trailers?title=...  — single trailer matched by title (returns 1 or 0).
 */
const trailersController = async (c: Context): Promise<TrailersPayload> => {
  const title = c.req.query('title');
  const limit = Math.min(Number(c.req.query('limit')) || 24, 50);

  if (title) {
    const one = await getTrailerByTitle(title);
    return { trailers: one ? [one] : [], total: one ? 1 : 0 };
  }

  const trailers = await getTrendingTrailers(limit);
  return { trailers, total: trailers.length };
};

export default trailersController;

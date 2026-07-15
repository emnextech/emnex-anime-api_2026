import { Context } from 'hono';
import * as megaplay from '../services/megaplay';
import { validationError, NotFoundError } from '../utils/errors';

/**
 * GET /api/v2/megaplay/servers/:anilistId?ep=N
 * Which categories (sub/dub) MegaPlay has for this episode.
 */
const megaplayServersController = async (c: Context) => {
  const anilistId = c.req.param('anilistId');
  const ep = c.req.query('ep') || '1';
  if (!anilistId) throw new validationError('anilistId is required');

  const data = await megaplay.servers(anilistId, ep);
  if (!data.sub && !data.dub) throw new NotFoundError('no MegaPlay source for this title/episode');
  return data;
};

export default megaplayServersController;

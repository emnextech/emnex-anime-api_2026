import { Context } from 'hono';
import { validationError } from '../utils/errors';

// KickAssAnime does not expose a per-anime next-episode countdown.
const nextEpisodeSchaduleController = async (c: Context): Promise<unknown> => {
  const id = c.req.param('id');
  if (!id) throw new validationError('id is required');

  return { nextEpisode: null };
};

export default nextEpisodeSchaduleController;

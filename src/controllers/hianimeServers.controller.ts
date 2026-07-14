import { Context } from 'hono';
import * as hianime from '../services/hianime';
import { validationError, NotFoundError } from '../utils/errors';

/**
 * GET /api/v2/hianime/servers?title=<anime title>&ep=<episode number>
 * Secondary DIRECT source: HiAnime sub/dub/raw servers for an episode.
 */
const hianimeServersController = async (c: Context) => {
  const title = c.req.query('title');
  const ep = Number(c.req.query('ep')) || 1;
  if (!title) throw new validationError('title is required');

  let data: hianime.HiAnimeServers;
  try {
    data = await hianime.servers(title, ep);
  } catch {
    throw new NotFoundError('no HiAnime match for this title/episode');
  }

  if (!data.sub.length && !data.dub.length && !data.raw.length) {
    throw new NotFoundError('no HiAnime servers for this title/episode');
  }
  return data;
};

export default hianimeServersController;

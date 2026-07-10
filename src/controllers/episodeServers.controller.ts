import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { NotFoundError, validationError } from '../utils/errors';

/**
 * GET /api/v2/episode/servers?animeId=<slug>&episodeId=<ep-N-xxx>
 * Lists the available streaming servers for one episode (sub or dub —
 * determined by the episodeId, which differs per language).
 */
const episodeServersController = async (c: Context) => {
  const animeId = c.req.query('animeId');
  const episodeId = c.req.query('episodeId');

  if (!animeId || !episodeId) {
    throw new validationError('animeId and episodeId are required', {
      example: '/api/v2/episode/servers?animeId=naruto-f3cf&episodeId=ep-1-12cd96',
    });
  }

  let info: kaa.EpisodeSourceInfo;
  try {
    info = await kaa.episodeSources(animeId, episodeId);
  } catch {
    throw new NotFoundError('episode not found — check animeId and episodeId');
  }

  return {
    language: info.language,
    category: info.isDub ? 'dub' : 'sub',
    nextEpisodeId: info.nextEpisodeId,
    servers: info.servers.map(s => ({ name: s.name, shortName: s.shortName })),
  };
};

export default episodeServersController;

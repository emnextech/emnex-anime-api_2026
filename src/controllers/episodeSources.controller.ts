import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { NotFoundError, validationError } from '../utils/errors';

/**
 * GET /api/v2/episode/sources?animeId=<slug>&episodeId=<ep-N-xxx>&server=<name>
 * Resolves an episode's chosen server down to a direct HLS (.m3u8) manifest
 * plus subtitle tracks, ready for a player. Defaults to the first server.
 */
const episodeSourcesController = async (c: Context) => {
  const animeId = c.req.query('animeId');
  const episodeId = c.req.query('episodeId');
  const serverQuery = c.req.query('server'); // vidstream | birdstream | shortName

  if (!animeId || !episodeId) {
    throw new validationError('animeId and episodeId are required', {
      example: '/api/v2/episode/sources?animeId=naruto-f3cf&episodeId=ep-1-12cd96',
    });
  }

  let info: kaa.EpisodeSourceInfo;
  try {
    info = await kaa.episodeSources(animeId, episodeId);
  } catch {
    throw new NotFoundError('episode not found — check animeId and episodeId');
  }

  if (info.servers.length < 1) throw new NotFoundError('no servers available for this episode');

  const server = serverQuery
    ? info.servers.find(
        s =>
          s.name.toLowerCase() === serverQuery.toLowerCase() ||
          s.shortName.toLowerCase() === serverQuery.toLowerCase() ||
          s.src.toLowerCase().includes(serverQuery.toLowerCase())
      ) || info.servers[0]
    : info.servers[0];

  const stream = await kaa.resolveStream(server.src);

  if (stream.sources.length < 1) {
    throw new NotFoundError('could not resolve a playable source for this server');
  }

  // Wrap upstream URLs through our media proxy so they play cross-origin
  // (the upstream host requires a Referer and sends no CORS headers).
  const proxy = (url: string) => `/api/v2/proxy?url=${encodeURIComponent(url)}`;

  return {
    category: info.isDub ? 'dub' : 'sub',
    language: info.language,
    server: server.name,
    sources: stream.sources.map(s => ({ ...s, url: s.url, proxyUrl: proxy(s.url) })),
    subtitles: stream.subtitles.map(s => ({ ...s, proxyUrl: proxy(s.url) })),
    embed: stream.embed,
  };
};

export default episodeSourcesController;

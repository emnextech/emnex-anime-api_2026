import { Context } from 'hono';
import * as enma from '../services/enma';
import { validationError, NotFoundError } from '../utils/errors';

/**
 * GET /api/v2/enma/servers/:anilistId?ep=N
 * Secondary source: lists enma.lol sub/dub iframe servers for an episode.
 */
const enmaServersController = async (c: Context) => {
  const anilistId = c.req.param('anilistId');
  const ep = c.req.query('ep') || '1';
  if (!anilistId) throw new validationError('anilistId is required');

  let list: enma.EnmaServer[];
  try {
    list = await enma.servers(anilistId, ep);
  } catch {
    throw new NotFoundError('no enma servers for this title/episode');
  }

  return {
    sub: list.filter(s => s.type === 'sub').map(s => s.serverName),
    dub: list.filter(s => s.type === 'dub').map(s => s.serverName),
    servers: list,
  };
};

export default enmaServersController;

import { Context } from 'hono';
import * as enma from '../services/enma';
import { validationError, NotFoundError } from '../utils/errors';

/**
 * GET /api/v2/enma/stream/:anilistId?ep=N&server=HD-1&type=sub[&skipIntro=1&skipOutro=1]
 * Resolves an enma.lol server to a playable iframe embed (+ intro/outro markers).
 */
const enmaStreamController = async (c: Context) => {
  const anilistId = c.req.param('anilistId');
  const ep = c.req.query('ep') || '1';
  const server = c.req.query('server') || 'HD-1';
  const type = (c.req.query('type') || 'sub').toLowerCase();
  const skipIntro = c.req.query('skipIntro') === '1';
  const skipOutro = c.req.query('skipOutro') === '1';

  if (!anilistId) throw new validationError('anilistId is required');
  if (type !== 'sub' && type !== 'dub') throw new validationError('type must be sub or dub');

  let result: enma.EnmaStream;
  try {
    result = await enma.stream(anilistId, ep, server, type, { skipIntro, skipOutro });
  } catch {
    throw new NotFoundError('could not resolve this enma server');
  }

  if (!result.iframe) throw new NotFoundError('no playable embed for this server');
  return result;
};

export default enmaStreamController;

import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { NotFoundError, validationError } from '../utils/errors';

const episodesController = async (c: Context) => {
  const id = c.req.param('id');
  const locale = kaa.langToLocale(c.req.query('lang')); // ?lang=sub (default) | dub

  if (!id) throw new validationError('id is required');

  let epList: kaa.KaaEpisode[];
  try {
    epList = await kaa.episodes(id, locale);
  } catch {
    throw new validationError('make sure the id is correct', { validIdEX: 'naruto-f3cf' });
  }

  if (epList.length < 1) throw new NotFoundError('no episodes found');

  return kaa.mapEpisodes(id, epList);
};

export default episodesController;

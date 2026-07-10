import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { validationError } from '../utils/errors';

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

  // A title with no episodes for this language (e.g. movies/specials the upstream
  // has no stream for) is a valid, non-error state — return an empty list (200)
  // so clients can render a graceful "not available" message instead of an error.
  return kaa.mapEpisodes(id, epList);
};

export default episodesController;

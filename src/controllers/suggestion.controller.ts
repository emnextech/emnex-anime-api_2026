import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { validationError } from '../utils/errors';

const suggestionController = async (c: Context) => {
  const keyword = c.req.query('keyword') || null;

  if (!keyword) throw new validationError('query is required');

  const results = await kaa.search(keyword.trim());

  return results.slice(0, 8).map(show => ({
    title: show.title_en || show.title || null,
    alternativeTitle: show.title || null,
    poster: kaa.imageUrl(show.poster),
    id: show.slug,
    aired: show.start_date ? show.start_date.split('T')[0] : null,
    type: show.type ? show.type.toUpperCase() : null,
    duration: null,
  }));
};

export default suggestionController;

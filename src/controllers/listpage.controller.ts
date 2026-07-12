import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { ListPageResponse } from '../extractor/extractListpage';
import { NotFoundError, validationError } from '../utils/errors';

const validateQueries = [
  'top-airing',
  'most-popular',
  'most-favorite',
  'completed',
  'recently-added',
  'recently-updated',
  'top-upcoming',
  'genre',
  'producer',
  'az-list',
  'subbed-anime',
  'dubbed-anime',
  'movie',
  'tv',
  'ova',
  'ona',
  'special',
  'events',
];

// KAA has no dedicated per-category listings, so map the "popular"-flavoured
// queries to /api/show/popular and everything else to the generic catalogue.
const popularQueries = new Set(['top-airing', 'most-popular', 'most-favorite', 'top-upcoming']);

const listpageController = async (c: Context): Promise<ListPageResponse> => {
  const query = c.req.param('query')?.toLowerCase() || '';
  const page = Number(c.req.query('page')) || 1;

  if (!validateQueries.includes(query)) {
    throw new validationError('invalid query', { validateQueries });
  }

  const category = c.req.param('category') || null;
  if ((query === 'genre' || query === 'producer') && !category) {
    throw new validationError(`category is required for query ${query}`);
  }

  // A–Z browse: `category` carries the letter (A–Z, "0-9", or "other"/"all").
  if (query === 'az-list') {
    const { result, totalPages } = await kaa.azList(category || 'all', page);
    if (result.length < 1) throw new NotFoundError();
    return kaa.toListPage(result, page, totalPages);
  }

  // Latest episodes / recently updated → the real "recent" feed (newest first).
  if (query === 'recently-updated' || query === 'recently-added') {
    const { result, hasNext } = await kaa.recent(page);
    if (result.length < 1) throw new NotFoundError();
    return kaa.toListPage(result, page, hasNext ? page + 1 : page);
  }

  const { result, totalPages } = popularQueries.has(query)
    ? await kaa.popular(page)
    : await kaa.catalogue(page);

  if (result.length < 1) throw new NotFoundError();

  return kaa.toListPage(result, page, totalPages);
};

export default listpageController;

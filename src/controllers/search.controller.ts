import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { ListPageResponse } from '../extractor/extractListpage';
import { NotFoundError, validationError } from '../utils/errors';

const searchController = async (c: Context): Promise<ListPageResponse> => {
  const keyword = c.req.query('keyword') || null;
  const page = Number(c.req.query('page')) || 1;

  if (!keyword) throw new validationError('query is required');

  const results = await kaa.search(keyword.trim());

  if (results.length < 1) {
    throw new NotFoundError('page not found');
  }

  return kaa.toListPage(results, page, 1);
};

export default searchController;

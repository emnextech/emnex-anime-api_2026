import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { ListPageResponse } from '../extractor/extractListpage';

// KAA exposes no rich filter endpoint, so keyword filters run through search and
// everything else falls back to the popular catalogue.
const filterController = async (c: Context): Promise<ListPageResponse> => {
  const { keyword = null, page = '1' } = c.req.query();
  const pageNum = Number(page) || 1;

  if (keyword) {
    const results = await kaa.search(keyword.trim());
    return kaa.toListPage(results, pageNum, 1);
  }

  const { result, totalPages } = await kaa.popular(pageNum);
  return kaa.toListPage(result, pageNum, totalPages);
};

export default filterController;

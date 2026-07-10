import { Context } from 'hono';
import { NewsResponse } from '../extractor/extractNews';

// KickAssAnime does not expose a news feed; return a valid empty payload.
const newsController = async (_c?: Context): Promise<NewsResponse> => {
  return { news: [], total: 0 };
};

export default newsController;

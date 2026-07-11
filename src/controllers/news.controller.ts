import { Context } from 'hono';
import { getNews, getNewsByTitle, NewsItem } from '../services/news';

interface NewsPayload {
  news: NewsItem[];
  total: number;
}

/** GET /news — aggregated latest anime news (ANN + Crunchyroll). */
const newsController = async (c: Context): Promise<NewsPayload> => {
  const limit = Math.min(Number(c.req.query('limit')) || 40, 60);
  const title = c.req.query('title');

  const news = title ? await getNewsByTitle(title, limit) : await getNews(limit);
  return { news, total: news.length };
};

export default newsController;

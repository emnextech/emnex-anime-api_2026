import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { TopSearchAnime } from '../extractor/extractTopSearch';

const topSearchController = async (_c?: Context): Promise<TopSearchAnime[]> => {
  const { result } = await kaa.popular(1);

  return result.slice(0, 10).map(show => ({
    title: show.title_en || show.title || null,
    link: `/anime/${show.slug}`,
    id: show.slug,
  }));
};

export default topSearchController;

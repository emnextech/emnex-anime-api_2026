import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { HomePage, SpotlightAnime, TrendingAnime } from '../types/anime';

const homepageController = async (_c?: Context): Promise<HomePage> => {
  const [pop, cat] = await Promise.all([kaa.popular(1), kaa.catalogue(1)]);

  const popularCards = pop.result.map(kaa.mapShow);
  const recentCards = cat.result.map(kaa.mapShow);

  const spotlight: SpotlightAnime[] = pop.result.slice(0, 10).map((show, i) => ({
    ...kaa.mapShow(show),
    rank: i + 1,
    quality: 'HD',
    duration: null,
    aired: show.start_date ? show.start_date.split('T')[0] : null,
    synopsis: show.synopsis || null,
  }));

  const trending: TrendingAnime[] = pop.result.slice(0, 10).map((show, i) => ({
    title: show.title_en || show.title || null,
    alternativeTitle: show.title || null,
    id: show.slug,
    poster: kaa.imageUrl(show.poster),
    rank: i + 1,
  }));

  return {
    spotlight,
    trending,
    topAiring: popularCards,
    mostPopular: popularCards,
    mostFavorite: popularCards,
    latestCompleted: recentCards,
    latestEpisode: recentCards,
    newAdded: recentCards,
    topUpcoming: recentCards,
    top10: { today: trending, week: trending, month: trending },
    genres: kaa.GENRES,
  };
};

export default homepageController;

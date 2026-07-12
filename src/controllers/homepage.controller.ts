import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { HomePage, SpotlightAnime, TrendingAnime } from '../types/anime';
import { KaaShow } from '../services/kaa';

const homepageController = async (_c?: Context): Promise<HomePage> => {
  // Pull real "latest / trending / top" feeds in parallel; tolerate any single
  // upstream hiccup so the home page still renders.
  const [topRes, trendRes, recentRes] = await Promise.all([
    kaa.top().catch(() => [] as KaaShow[]),
    kaa.trending().catch(() => [] as KaaShow[]),
    kaa.recent(1).catch(() => ({ result: [] as KaaShow[], hasNext: false })),
  ]);

  // Fallbacks if a feed came back empty (keeps the grid full).
  let topShows = topRes;
  let trendShows = trendRes.length ? trendRes : topRes;
  let recentShows = recentRes.result;

  if (!topShows.length || !recentShows.length) {
    const [pop, cat] = await Promise.all([
      kaa.popular(1).catch(() => ({ result: [] as KaaShow[], totalPages: 1 })),
      kaa.catalogue(1).catch(() => ({ result: [] as KaaShow[], totalPages: 1 })),
    ]);
    if (!topShows.length) topShows = pop.result;
    if (!trendShows.length) trendShows = pop.result;
    if (!recentShows.length) recentShows = cat.result;
  }

  const topCards = topShows.map(kaa.mapShow);
  const trendCards = trendShows.map(kaa.mapShow);
  const recentCards = recentShows.map(kaa.mapShow);

  const spotlightSource = trendShows.length ? trendShows : topShows;
  const spotlight: SpotlightAnime[] = spotlightSource.slice(0, 10).map((show, i) => ({
    ...kaa.mapShow(show),
    rank: i + 1,
    quality: 'HD',
    duration: null,
    aired: show.start_date ? show.start_date.split('T')[0] : null,
    synopsis: show.synopsis || null,
  }));

  const trending: TrendingAnime[] = (trendShows.length ? trendShows : topShows)
    .slice(0, 10)
    .map((show, i) => ({
      title: show.title_en || show.title || null,
      alternativeTitle: show.title || null,
      id: show.slug,
      poster: kaa.imageUrl(show.poster),
      rank: i + 1,
    }));

  return {
    spotlight,
    trending,
    topAiring: trendCards.length ? trendCards : topCards,
    mostPopular: topCards,
    mostFavorite: topCards,
    latestCompleted: recentCards,
    latestEpisode: recentCards,
    newAdded: recentCards,
    topUpcoming: recentCards,
    top10: { today: trending, week: trending, month: trending },
    genres: kaa.GENRES,
  };
};

export default homepageController;

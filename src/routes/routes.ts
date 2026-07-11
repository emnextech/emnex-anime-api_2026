import { Hono } from 'hono';
import handler from '../utils/handler';

import homepageController from '../controllers/homepage.controller';
import detailpageController from '../controllers/detailpage.controller';
import listpageController from '../controllers/listpage.controller';
import searchController from '../controllers/search.controller';
import suggestionController from '../controllers/suggestion.controller';
import charactersController from '../controllers/characters.controller';
import characterDetailConroller from '../controllers/characterDetail.controller';
import episodesController from '../controllers/episodes.controller';
import allGenresController from '../controllers/allGenres.controller';
import nextEpisodeScheduleController from '../controllers/nextEpisodeSchedule.controller';
import filterController from '../controllers/filter.controller';
import filterOptions from '../utils/filter';
import newsController from '../controllers/news.controller';
import trailersController from '../controllers/trailers.controller';
import randomController from '../controllers/random.controller';
import schedulesController from '../controllers/schedules.controller';
import topSearchController from '../controllers/topSearch.controller';
import episodeServersController from '../controllers/episodeServers.controller';
import episodeSourcesController from '../controllers/episodeSources.controller';
import proxyController from '../controllers/proxy.controller';
import {
  mangaHomeController,
  mangaSearchController,
  mangaInfoController,
  mangaReadController,
  mangaRecentController,
  mangaNewController,
  mangaTrendingController,
  mangaBrowseController,
  mangaGenresController,
  mangaImageController,
} from '../controllers/manga.controller';

const router = new Hono();

router.get('/home', handler(homepageController));
router.get('/top-search', handler(topSearchController));
router.get('/schedules', handler(schedulesController));
router.get('/schedule/next/:id', handler(nextEpisodeScheduleController));
router.get('/anime/:id', handler(detailpageController));
router.get('/animes/:query/:category?', handler(listpageController));
router.get('/search', handler(searchController));
router.get(
  '/filter/options',
  handler(async () => filterOptions)
);
router.get('/filter', handler(filterController));
router.get('/suggestion', handler(suggestionController));
router.get('/characters/:id', handler(charactersController));
router.get('/character/:id', handler(characterDetailConroller));
router.get('/episodes/:id', handler(episodesController));
router.get('/episode/servers', handler(episodeServersController));
router.get('/episode/sources', handler(episodeSourcesController));
router.get('/proxy', proxyController);
router.get('/genres', handler(allGenresController));

// Manga (single-API: manga lives alongside anime)
router.get('/manga/home', handler(mangaHomeController));
router.get('/manga/search', handler(mangaSearchController));
router.get('/manga/info', handler(mangaInfoController));
router.get('/manga/read', handler(mangaReadController));
router.get('/manga/recent', handler(mangaRecentController));
router.get('/manga/new', handler(mangaNewController));
router.get('/manga/trending', handler(mangaTrendingController));
router.get('/manga/browse', handler(mangaBrowseController));
router.get('/manga/genres', handler(mangaGenresController));
router.get('/manga/image', mangaImageController);

router.get('/news', handler(newsController));
router.get('/trailers', handler(trailersController));
router.get('/random', handler(randomController));

export default router;

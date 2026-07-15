import config from '../config/config';
import { AnimeFeatured, DetailAnime, TrendingAnime } from '../types/anime';
import { ListPageResponse, ListPageAnime } from '../extractor/extractListpage';

/**
 * Upstream JSON API adapter.
 *
 * Sources anime data from the configured upstream JSON API and maps it onto the
 * response shapes exposed by Emnex Anime API.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY = 800;
const TIMEOUT = 15000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface KaaImage {
  formats?: string[];
  sm?: string;
  hq?: string;
  aspectRatio?: number;
}

interface KaaShow {
  slug: string;
  title: string;
  title_en?: string;
  title_original?: string;
  synopsis?: string;
  type?: string;
  year?: number;
  status?: string;
  rating?: string;
  season?: string;
  genres?: string[];
  locales?: string[];
  episode_duration?: number;
  episode_number?: number; // present on /api/show/recent — the latest episode
  start_date?: string;
  end_date?: string;
  poster?: KaaImage;
  banner?: KaaImage;
  watch_uri?: string;
}

interface KaaEpisode {
  slug: string;
  title?: string;
  duration_ms?: number;
  episode_number: number;
  episode_string?: string;
  thumbnail?: KaaImage;
}

interface KaaServer {
  name: string;
  shortName: string;
  src: string;
}

export interface EpisodeSourceInfo {
  language: string;
  isDub: boolean;
  servers: KaaServer[];
  nextEpisodeId: string | null;
}

export interface ResolvedStream {
  server: string;
  source: string | null;
  embed: string;
  sources: { url: string; type: string; isM3U8: boolean }[];
  subtitles: { lang: string; label: string; url: string }[];
}

/** Language locale -> sub/dub flag. */
export const langToLocale = (lang?: string): string =>
  lang && lang.toLowerCase() === 'dub' ? 'en-US' : 'ja-JP';

/** Low-level JSON request with retries against the KAA API. */
export const kaaRequest = async <T>(
  path: string,
  options: { method?: string; body?: unknown; retries?: number } = {}
): Promise<T> => {
  const { method = 'GET', body, retries = MAX_RETRIES } = options;
  const url = config.baseurl + path;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) await sleep(RETRY_DELAY * Math.pow(2, attempt - 1));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

      const response = await fetch(url, {
        method,
        headers: {
          ...(config.headers || {}),
          Accept: 'application/json, text/plain, */*',
          Referer: `${config.baseurl}/`,
          Origin: config.baseurl,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        await sleep(RETRY_DELAY * 2);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error: unknown) {
      if (error instanceof Error) {
        lastError = error;
        if (error.name === 'AbortError') lastError = new Error('Upstream request timed out');
      }
      if (attempt === retries - 1) break;
    }
  }

  throw lastError || new Error('Unknown upstream error');
};

/** Build a full poster URL from a KAA image key. */
export const imageUrl = (img?: KaaImage): string | null => {
  const key = img?.hq || img?.sm;
  return key ? `${config.imageBase}/${key}.webp` : null;
};

// Episode thumbnails are served from /image/thumbnail (not /image/poster).
const THUMB_BASE = config.imageBase.replace(/\/poster$/, '/thumbnail');

/** Build a full episode-thumbnail URL from a KAA image key. */
export const thumbUrl = (img?: KaaImage): string | null => {
  const key = img?.hq || img?.sm;
  return key ? `${THUMB_BASE}/${key}.webp` : null;
};

// Wide banner art is served from /image/banner.
const BANNER_BASE = config.imageBase.replace(/\/poster$/, '/banner');

/** Build a full banner URL from a KAA image key. */
export const bannerUrl = (img?: KaaImage): string | null => {
  const key = img?.hq || img?.sm;
  return key ? `${BANNER_BASE}/${key}.webp` : null;
};

const toDuration = (seconds?: number): string | null =>
  seconds ? `${Math.round(seconds / 60)}m` : null;

/** Map a KAA show onto the list/card shape (AnimeFeatured + duration). */
export const mapShow = (show: KaaShow): ListPageAnime => {
  // KAA's list feeds (popular/top/trending/search) omit `locales`, which would
  // hide both sub & dub badges. Nearly every title has a Japanese (sub) track, so
  // assume sub when locale info is absent, and only flag dub when we actually know.
  const locales = Array.isArray(show.locales) ? show.locales : [];
  const sub = locales.length === 0 || locales.includes('ja-JP') ? 1 : null;
  const dub = locales.includes('en-US') ? 1 : null;
  return {
    title: show.title_en || show.title || null,
    alternativeTitle: show.title || show.title_original || null,
    id: show.slug,
    poster: imageUrl(show.poster),
    episodes: { sub, dub, eps: show.episode_number ?? null },
    type: show.type ? show.type.toUpperCase() : null,
    duration: toDuration(show.episode_duration),
  };
};

const emptyTop10 = { today: [] as TrendingAnime[], week: [] as TrendingAnime[], month: [] as TrendingAnime[] };

/** Canonical genre list surfaced by KickAssAnime. */
export const GENRES = [
  'action', 'adventure', 'cars', 'comedy', 'dementia', 'demons', 'drama', 'ecchi',
  'fantasy', 'game', 'harem', 'historical', 'horror', 'isekai', 'josei', 'kids',
  'magic', 'martial arts', 'mecha', 'military', 'music', 'mystery', 'parody',
  'police', 'psychological', 'romance', 'samurai', 'school', 'sci-fi', 'seinen',
  'shoujo', 'shounen', 'slice of life', 'space', 'sports', 'super power',
  'supernatural', 'thriller', 'vampire',
];

/** POST /api/search — keyword search. Returns up to a handful of matches. */
export const search = async (query: string): Promise<KaaShow[]> => {
  const data = await kaaRequest<KaaShow[]>('/api/search', {
    method: 'POST',
    body: { query },
  });
  return Array.isArray(data) ? data : [];
};

/** GET /api/show/popular — popular anime, paginated. */
export const popular = async (page: number): Promise<{ result: KaaShow[]; totalPages: number }> => {
  const data = await kaaRequest<{ result: KaaShow[]; page_count: number }>(
    `/api/show/popular?page=${page}`
  );
  return { result: data.result || [], totalPages: data.page_count || 1 };
};

/** GET /api/anime — full catalogue (used for "recent"/generic listings). */
export const catalogue = async (
  page: number
): Promise<{ result: KaaShow[]; totalPages: number }> => {
  const data = await kaaRequest<{ result: KaaShow[]; maxPage: number }>(`/api/anime?page=${page}`);
  return { result: data.result || [], totalPages: data.maxPage || 1 };
};

/**
 * GET /api/show/recent — latest episodes / recently-updated shows, newest first.
 * Each item carries the latest `episode_number`, so cards can show "EP N".
 */
export const recent = async (
  page: number
): Promise<{ result: KaaShow[]; hasNext: boolean }> => {
  const data = await kaaRequest<{ result: KaaShow[]; hadNext?: boolean }>(
    `/api/show/recent?page=${page}`
  );
  return { result: data.result || [], hasNext: Boolean(data.hadNext) };
};

/** GET /api/show/trending — currently trending shows (single page, ~24). */
export const trending = async (): Promise<KaaShow[]> => {
  const data = await kaaRequest<{ result: KaaShow[] }>('/api/show/trending');
  return data.result || [];
};

/** GET /api/show/top — top / most-popular shows (single page, ~24). */
export const top = async (): Promise<KaaShow[]> => {
  const data = await kaaRequest<{ result: KaaShow[] }>('/api/show/top');
  return data.result || [];
};

// ---------------------------------------------------------------------------
// A–Z browse
//
// KAA exposes no native "titles starting with X" endpoint, so we build an
// in-memory index of the whole catalogue once (cached for a few hours) and then
// filter + paginate it locally. The upstream is only walked on the first request
// after the cache expires, in small parallel batches.
// ---------------------------------------------------------------------------
const CATALOGUE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const CATALOGUE_PAGE_CAP = 200; // safety cap on pages to walk
const CATALOGUE_CONCURRENCY = 8;

let catalogueCache: { at: number; shows: KaaShow[] } | null = null;
let cataloguePromise: Promise<KaaShow[]> | null = null;

const fetchAllCatalogue = async (): Promise<KaaShow[]> => {
  const first = await kaaRequest<{ result: KaaShow[]; maxPage: number }>('/api/anime?page=1');
  const shows = [...(first.result || [])];
  const maxPage = Math.min(first.maxPage || 1, CATALOGUE_PAGE_CAP);

  const pages: number[] = [];
  for (let p = 2; p <= maxPage; p++) pages.push(p);

  for (let i = 0; i < pages.length; i += CATALOGUE_CONCURRENCY) {
    const batch = pages.slice(i, i + CATALOGUE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(p =>
        kaaRequest<{ result: KaaShow[] }>(`/api/anime?page=${p}`)
          .then(d => d.result || [])
          .catch(() => [] as KaaShow[])
      )
    );
    for (const r of results) shows.push(...r);
  }
  return shows;
};

const getCatalogue = async (): Promise<KaaShow[]> => {
  if (catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_TTL) {
    return catalogueCache.shows;
  }
  if (!cataloguePromise) {
    cataloguePromise = fetchAllCatalogue()
      .then(shows => {
        catalogueCache = { at: Date.now(), shows };
        cataloguePromise = null;
        return shows;
      })
      .catch(err => {
        cataloguePromise = null;
        throw err;
      });
  }
  return cataloguePromise;
};

/** Bucket a show under a single A–Z / 0-9 / # (other) key by its display title. */
const letterBucket = (show: KaaShow): string => {
  const c = (show.title_en || show.title || '').trim().charAt(0).toUpperCase();
  if (c >= '0' && c <= '9') return '0-9';
  if (c >= 'A' && c <= 'Z') return c;
  return '#';
};

/** A–Z browse: titles whose first character matches `letter`, sorted & paginated. */
export const azList = async (
  letter: string,
  page: number,
  perPage = 30
): Promise<{ result: KaaShow[]; totalPages: number }> => {
  const shows = await getCatalogue();
  const key = (letter || 'all').toUpperCase();
  const normalized = key === 'OTHER' ? '#' : key;

  const filtered =
    normalized === 'ALL' || normalized === ''
      ? shows
      : shows.filter(s => letterBucket(s) === normalized);

  filtered.sort((a, b) =>
    (a.title_en || a.title || '').localeCompare(b.title_en || b.title || '')
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const start = (page - 1) * perPage;
  return { result: filtered.slice(start, start + perPage), totalPages };
};

/** GET /api/show/:slug — full detail for one anime. */
export const detail = async (slug: string): Promise<KaaShow> =>
  kaaRequest<KaaShow>(`/api/show/${slug}`);

interface KaaScheduleEntry {
  title: string;
  title_en?: string;
  slug: string;
  poster?: KaaImage;
  ts: number; // airing time (ms epoch)
}

export interface ScheduleItem {
  id: string;
  title: string | null;
  jname: string | null;
  poster: string | null;
  airingAt: number;
}

/** GET /api/schedule — upcoming airings (flat, sorted by airing time). */
export const schedule = async (): Promise<ScheduleItem[]> => {
  const data = await kaaRequest<KaaScheduleEntry[]>('/api/schedule');
  return (Array.isArray(data) ? data : [])
    .filter(e => e && e.slug && typeof e.ts === 'number')
    .map(e => ({
      id: e.slug,
      title: e.title_en || e.title || null,
      jname: e.title || null,
      poster: imageUrl(e.poster),
      airingAt: e.ts,
    }))
    .sort((a, b) => a.airingAt - b.airingAt);
};

/** GET /api/show/:slug/episodes — all episodes (walks every page). */
export const episodes = async (slug: string, locale = 'ja-JP'): Promise<KaaEpisode[]> => {
  const first = await kaaRequest<{
    current_page: number;
    pages: { number: number }[];
    result: KaaEpisode[];
  }>(`/api/show/${slug}/episodes?ep=1&lang=${locale}`);

  const all = [...(first.result || [])];
  const pageNumbers = (first.pages || []).map(p => p.number).filter(n => n > 1);

  for (const n of pageNumbers) {
    try {
      const pg = await kaaRequest<{ result: KaaEpisode[] }>(
        `/api/show/${slug}/episodes?page=${n}&lang=${locale}`
      );
      if (Array.isArray(pg.result)) all.push(...pg.result);
    } catch {
      // skip a failed page rather than fail the whole request
    }
  }
  return all;
};

/** Build a ListPageResponse envelope around a set of mapped shows. */
export const toListPage = (
  shows: KaaShow[],
  page: number,
  totalPages: number
): ListPageResponse => ({
  pageInfo: {
    currentPage: page,
    hasNextPage: page < totalPages,
    totalPages,
  },
  response: shows.map(mapShow),
  top10: emptyTop10,
  genres: GENRES,
});

/** Map a KAA detail payload onto the DetailAnime shape. */
export const mapDetail = (show: KaaShow, epList: KaaEpisode[]): DetailAnime => {
  const locales = Array.isArray(show.locales) ? show.locales : [];
  const subEps = locales.length === 0 || locales.includes('ja-JP') ? epList.length : null;
  const dubEps = locales.includes('en-US') ? epList.length : null;
  return {
    title: show.title_en || show.title || null,
    alternativeTitle: show.title || null,
    japanese: show.title_original || show.title || null,
    id: show.slug,
    poster: imageUrl(show.poster),
    banner: bannerUrl(show.banner),
    rating: show.rating || null,
    is18Plus: show.rating === 'R+' || show.rating === 'Rx',
    type: show.type ? show.type.toUpperCase() : null,
    episodes: { sub: subEps, dub: dubEps, eps: epList.length || null },
    duration: toDuration(show.episode_duration),
    synopsis: show.synopsis || null,
    synonyms: show.title_original || null,
    aired: {
      from: show.start_date ? show.start_date.split('T')[0] : null,
      to: show.end_date ? show.end_date.split('T')[0] : null,
    },
    premiered: show.season && show.year ? `${show.season} ${show.year}` : null,
    status: show.status ? show.status.replace(/_/g, ' ') : null,
    MAL_score: null,
    genres: show.genres || [],
    studios: [],
    producers: [],
    moreSeasons: [],
    related: [],
    mostPopular: [],
    recommended: [],
  };
};

/**
 * Map a KAA episode onto the episode list shape used by /episodes.
 * `id` is the watch-slug (`ep-<number>-<slug>`) that the streaming endpoints
 * consume together with the anime slug.
 */
export const mapEpisodes = (slug: string, epList: KaaEpisode[]) => ({
  totalEpisodes: epList.length,
  episodes: epList.map(ep => ({
    title: ep.title || `Episode ${ep.episode_number}`,
    alternativeTitle: null,
    episodeNumber: ep.episode_number,
    id: `ep-${ep.episode_number}-${ep.slug}`,
    isFiller: false,
    thumbnail: thumbUrl(ep.thumbnail),
  })),
});

/** GET /api/show/:slug/episode/:episodeId — server list for one episode. */
export const episodeSources = async (
  animeSlug: string,
  episodeId: string
): Promise<EpisodeSourceInfo> => {
  const data = await kaaRequest<{
    language?: string;
    servers?: KaaServer[];
    next_ep_slug?: string;
  }>(`/api/show/${animeSlug}/episode/${episodeId}`);

  return {
    language: data.language || 'ja-JP',
    isDub: (data.language || '').toLowerCase() === 'en-us',
    servers: data.servers || [],
    nextEpisodeId: data.next_ep_slug || null,
  };
};

/**
 * Resolve a KAA embed player URL down to a direct HLS manifest + subtitle
 * tracks by reading the player page's serialized state.
 */
export const resolveStream = async (embedSrc: string): Promise<ResolvedStream> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
  const res = await fetch(embedSrc, {
    headers: { ...(config.headers || {}), Referer: `${config.baseurl}/` },
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  const html = (await res.text()).replace(/&quot;/g, '"');

  const manifest = html.match(/"manifest":\[0,"([^"]+)"\]/)?.[1] || null;

  const subtitles = [
    ...html.matchAll(
      /"language":\[0,"([^"]+)"\],"name":\[0,"([^"]+)"\],"src":\[0,"([^"]+\.vtt[^"]*)"\]/g
    ),
  ].map(m => ({ lang: m[1], label: m[2], url: m[3] }));

  const sourceName = new URL(embedSrc).searchParams.get('source');

  return {
    server: sourceName || 'vidstream',
    source: sourceName,
    embed: embedSrc,
    sources: manifest ? [{ url: manifest, type: 'hls', isM3U8: true }] : [],
    subtitles,
  };
};

export type { KaaShow, KaaEpisode };

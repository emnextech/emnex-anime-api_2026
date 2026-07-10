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

/** Build a full poster/thumbnail URL from a KAA image key. */
export const imageUrl = (img?: KaaImage): string | null => {
  const key = img?.hq || img?.sm;
  return key ? `${config.imageBase}/${key}.webp` : null;
};

const toDuration = (seconds?: number): string | null =>
  seconds ? `${Math.round(seconds / 60)}m` : null;

const hasLocale = (show: KaaShow, locale: string): boolean =>
  Array.isArray(show.locales) && show.locales.includes(locale);

/** Map a KAA show onto the list/card shape (AnimeFeatured + duration). */
export const mapShow = (show: KaaShow): ListPageAnime => ({
  title: show.title_en || show.title || null,
  alternativeTitle: show.title || show.title_original || null,
  id: show.slug,
  poster: imageUrl(show.poster),
  episodes: {
    sub: hasLocale(show, 'ja-JP') ? 1 : null,
    dub: hasLocale(show, 'en-US') ? 1 : null,
    eps: null,
  },
  type: show.type ? show.type.toUpperCase() : null,
  duration: toDuration(show.episode_duration),
});

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

/** GET /api/show/:slug — full detail for one anime. */
export const detail = async (slug: string): Promise<KaaShow> =>
  kaaRequest<KaaShow>(`/api/show/${slug}`);

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
  const subEps = hasLocale(show, 'ja-JP') ? epList.length : null;
  const dubEps = hasLocale(show, 'en-US') ? epList.length : null;
  return {
    title: show.title_en || show.title || null,
    alternativeTitle: show.title || null,
    japanese: show.title_original || show.title || null,
    id: show.slug,
    poster: imageUrl(show.poster),
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
    thumbnail: imageUrl(ep.thumbnail),
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

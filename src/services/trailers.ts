/**
 * Anime trailers & clips via the AniList GraphQL API (public, no auth).
 *
 * Provides a global "trending trailers" list plus a per-title lookup used on the
 * detail page. Only YouTube/Dailymotion-hosted trailers are returned so the
 * frontend can embed them directly.
 */

const ANILIST = 'https://graphql.anilist.co';
const FETCH_TIMEOUT = 12000;

export interface Trailer {
  id: number; // AniList media id
  title: string | null;
  englishTitle: string | null;
  trailerId: string; // YouTube/Dailymotion video id
  site: string; // "youtube" | "dailymotion"
  thumbnail: string | null;
  banner: string | null;
  cover: string | null;
  embedUrl: string;
  watchUrl: string; // external (YouTube) link
}

interface AniListMedia {
  id: number;
  title?: { romaji?: string | null; english?: string | null };
  trailer?: { id?: string | null; site?: string | null; thumbnail?: string | null } | null;
  bannerImage?: string | null;
  coverImage?: { large?: string | null; extraLarge?: string | null } | null;
}

const embedFor = (site: string, id: string): string =>
  site === 'dailymotion'
    ? `https://www.dailymotion.com/embed/video/${id}`
    : `https://www.youtube.com/embed/${id}`;

const watchFor = (site: string, id: string): string =>
  site === 'dailymotion'
    ? `https://www.dailymotion.com/video/${id}`
    : `https://www.youtube.com/watch?v=${id}`;

const mapTrailer = (m: AniListMedia): Trailer | null => {
  const t = m.trailer;
  if (!t?.id || !t.site) return null;
  const site = t.site.toLowerCase();
  if (site !== 'youtube' && site !== 'dailymotion') return null;
  return {
    id: m.id,
    title: m.title?.romaji || m.title?.english || null,
    englishTitle: m.title?.english || null,
    trailerId: t.id,
    site,
    thumbnail:
      t.thumbnail ||
      (site === 'youtube' ? `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg` : null),
    banner: m.bannerImage || null,
    cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
    embedUrl: embedFor(site, t.id),
    watchUrl: watchFor(site, t.id),
  };
};

const anilist = async <T>(query: string, variables: Record<string, unknown>): Promise<T | null> => {
  try {
    const res = await fetch(ANILIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
};

const MEDIA_FIELDS = `
  id
  title { romaji english }
  trailer { id site thumbnail }
  bannerImage
  coverImage { large extraLarge }`;

const TRENDING_QUERY = `
query ($perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
      ${MEDIA_FIELDS}
    }
  }
}`;

const SEARCH_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    ${MEDIA_FIELDS}
  }
}`;

const TRAILERS_TTL = 30 * 60 * 1000; // 30 minutes
let trailersCache: { at: number; items: Trailer[] } | null = null;

/** Trending anime that have a trailer, cached ~30 minutes. */
export const getTrendingTrailers = async (limit = 24): Promise<Trailer[]> => {
  if (trailersCache && Date.now() - trailersCache.at < TRAILERS_TTL) {
    return trailersCache.items.slice(0, limit);
  }
  // Over-fetch since not every trending title has a trailer.
  const data = await anilist<{ Page?: { media?: AniListMedia[] } }>(TRENDING_QUERY, {
    perPage: Math.min(50, limit * 2),
  });
  const items = (data?.Page?.media ?? [])
    .map(mapTrailer)
    .filter((t): t is Trailer => t !== null);
  if (items.length) trailersCache = { at: Date.now(), items };
  return items.slice(0, limit);
};

const titleTrailerCache = new Map<string, { at: number; trailer: Trailer | null }>();

/** Trailer for a single anime, matched by title. */
export const getTrailerByTitle = async (title: string): Promise<Trailer | null> => {
  const key = title.trim().toLowerCase();
  if (!key) return null;
  const cached = titleTrailerCache.get(key);
  if (cached && Date.now() - cached.at < TRAILERS_TTL) return cached.trailer;

  const data = await anilist<{ Media?: AniListMedia }>(SEARCH_QUERY, { search: title });
  const trailer = data?.Media ? mapTrailer(data.Media) : null;
  titleTrailerCache.set(key, { at: Date.now(), trailer });
  return trailer;
};

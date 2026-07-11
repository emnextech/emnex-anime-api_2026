/**
 * Manga provider (MangaPill) — direct scraping, ported from the standalone
 * Cloudflare Worker so manga lives inside this single API. Plain fetch + regex
 * parsing with light in-memory caching. Also exposes an image proxy so the
 * browser can load hotlink-protected CDN images.
 */

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Cache-Control': 'no-cache',
};

const BASE = 'https://mangapill.com';
const FETCH_TIMEOUT = 15000;

export interface MangaCard {
  id: string;
  title: string;
  image: string;
  url?: string;
  provider?: string;
}

export interface MangaChapter {
  id: string;
  title: string;
  chapterNumber: string;
}

export interface MangaInfo {
  id: string;
  title: string;
  image: string | null;
  description: string;
  genres: string[];
  status: string;
  chapters: MangaChapter[];
  totalChapters: number;
}

export interface MangaPage {
  page: number;
  img: string;
}

export interface ListResult<T> {
  currentPage: number;
  hasNextPage: boolean;
  results: T[];
}

// --- HTML helpers ------------------------------------------------------------
const stripHtmlTags = (html: string): string => html.replace(/<[^>]*>/g, '').trim();

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
  '&#x27;': "'", '&#x2F;': '/', '&#8217;': "'", '&#8220;': '"', '&#8221;': '"',
  '&#8211;': '-', '&#8212;': '—',
};
const decodeHtmlEntities = (text: string): string =>
  text.replace(/&[^;]+;/g, e => ENTITIES[e] || e);

const extractAllMatches = (html: string, regex: RegExp): RegExpExecArray[] => {
  const matches: RegExpExecArray[] = [];
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const re = new RegExp(regex.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) matches.push(m);
  return matches;
};

const fetchHtml = async (url: string): Promise<string> => {
  const res = await fetch(url, {
    headers: DEFAULT_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.text();
};

// --- tiny TTL cache ----------------------------------------------------------
const cache = new Map<string, { at: number; value: unknown }>();
const cached = async <T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
};

// --- MangaPill provider ------------------------------------------------------
export const search = (query: string, page = 1): Promise<ListResult<MangaCard>> =>
  cached(`search:${query}:${page}`, 5 * 60_000, async () => {
    const params = new URLSearchParams({ q: query });
    if (page > 1) params.append('page', String(page));
    const html = await fetchHtml(`${BASE}/search?${params.toString()}`);

    const results: MangaCard[] = [];
    const re =
      /<a\s+href="\/manga\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*(?:data-src|src)="([^"]+)"[\s\S]*?<div[^>]*>([^<]+)<\/div>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const image = m[2].startsWith('http') ? m[2] : `${BASE}${m[2]}`;
      results.push({ id: m[1], title: decodeHtmlEntities(m[3].trim()), image, url: `${BASE}/manga/${m[1]}`, provider: 'MangaPill' });
    }
    return { currentPage: page, hasNextPage: html.includes(`page=${page + 1}"`), results };
  });

export const advancedSearch = (
  opts: { query?: string; genre?: string; type?: string; status?: string; page?: number }
): Promise<ListResult<MangaCard>> => {
  const { query = '', genre = '', type = '', status = '', page = 1 } = opts;
  return cached(`adv:${query}:${genre}:${type}:${status}:${page}`, 5 * 60_000, async () => {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (genre) params.append('genre', genre);
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (page > 1) params.append('page', String(page));
    const html = await fetchHtml(`${BASE}/search?${params.toString()}`);

    const results: MangaCard[] = [];
    const re =
      /<a\s+href="\/manga\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*(?:data-src|src)="([^"]+)"[\s\S]*?<div[^>]*>([^<]+)<\/div>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const image = m[2].startsWith('http') ? m[2] : `${BASE}${m[2]}`;
      results.push({ id: m[1], title: decodeHtmlEntities(m[3].trim()), image, url: `${BASE}/manga/${m[1]}`, provider: 'MangaPill' });
    }
    return { currentPage: page, hasNextPage: html.includes(`page=${page + 1}"`), results };
  });
};

export const info = (mangaId: string): Promise<MangaInfo> =>
  cached(`info:${mangaId}`, 30 * 60_000, async () => {
    const url = `${BASE}/manga/${mangaId}`;
    const html = await fetchHtml(url);

    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : mangaId;

    const imageMatch = html.match(/<img[^>]*src="(https:\/\/cdn[^"]+)"[^>]*\/>/i);
    const image = imageMatch ? imageMatch[1] : null;

    const descMatch = html.match(/<p[^>]*class="[^"]*text--secondary[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch ? decodeHtmlEntities(stripHtmlTags(descMatch[1]).trim()) : '';

    const genres = extractAllMatches(html, /<a[^>]*href="\/search\?genre=[^"]*"[^>]*>([^<]+)<\/a>/gi).map(g =>
      decodeHtmlEntities(g[1])
    );

    const statusMatch =
      html.match(/Status[^<]*<[^>]*>([^<]+)<\/a>/i) || html.match(/Ongoing|Completed|Hiatus/i);
    const status = statusMatch ? (statusMatch[1] || statusMatch[0]).trim().toUpperCase() : 'UNKNOWN';

    const chapters: MangaChapter[] = [];
    const chRe = /<a[^>]*href="\/chapters\/([^\/"]+\/[^"]+)"[^>]*title="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = chRe.exec(html)) !== null) {
      const text = cm[3].trim();
      const num = text.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      chapters.push({ id: cm[1], title: (cm[2].trim() || text), chapterNumber: num ? num[1] : 'Unknown' });
    }

    return { id: mangaId, title, image, description, genres, status, chapters, totalChapters: chapters.length };
  });

export const read = (chapterId: string): Promise<MangaPage[]> =>
  cached(`read:${chapterId}`, 60 * 60_000, async () => {
    const html = await fetchHtml(`${BASE}/chapters/${chapterId}`);
    const pages: MangaPage[] = [];
    const re = /<img[^>]*class="js-page"[^>]*data-src="([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) pages.push({ page: pages.length + 1, img: m[1] });
    return pages;
  });

export const recent = (page = 1): Promise<ListResult<{
  chapterId: string; chapterTitle: string; chapterNumber: string; mangaId: string; mangaTitle: string; image: string;
}>> =>
  cached(`recent:${page}`, 3 * 60_000, async () => {
    const url = page > 1 ? `${BASE}/chapters?page=${page}` : `${BASE}/chapters`;
    const html = await fetchHtml(url);

    const chapterLinks: string[] = [];
    const clRe = /<a\s+href="\/chapters\/([^"]+)"[^>]*class="relative block"/gi;
    let lm: RegExpExecArray | null;
    while ((lm = clRe.exec(html)) !== null) chapterLinks.push(lm[1]);

    const images: { url: string; alt: string }[] = [];
    const imgRe = /<img\s+data-src="([^"]+)"[^>]*alt="([^"]+)"/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(html)) !== null) images.push({ url: im[1], alt: im[2] });

    const mangaLinks: { id: string; title: string }[] = [];
    const mlRe = /<a\s+href="\/manga\/([^"]+)"[^>]*class="[^"]*text-secondary[^"]*">\s*<div[^>]*>([^<]+)<\/div>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = mlRe.exec(html)) !== null) mangaLinks.push({ id: mm[1], title: mm[2] });

    const results = [];
    const n = Math.min(chapterLinks.length, images.length, mangaLinks.length);
    for (let i = 0; i < n; i++) {
      const chapterTitle = decodeHtmlEntities(images[i].alt);
      const num = chapterTitle.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      results.push({
        chapterId: chapterLinks[i],
        chapterTitle,
        chapterNumber: num ? num[1] : 'Unknown',
        mangaId: mangaLinks[i].id,
        mangaTitle: decodeHtmlEntities(mangaLinks[i].title),
        image: images[i].url,
      });
    }
    return { currentPage: page, hasNextPage: html.includes(`page=${page + 1}"`), results };
  });

export const latest = (page = 1): Promise<ListResult<MangaCard>> =>
  cached(`new:${page}`, 10 * 60_000, async () => {
    const url = page > 1 ? `${BASE}/mangas/new?page=${page}` : `${BASE}/mangas/new`;
    const html = await fetchHtml(url);

    const ids: string[] = [];
    const idRe = /<a\s+href="\/manga\/([^"]+)"[^>]*class="relative block"/gi;
    let idm: RegExpExecArray | null;
    while ((idm = idRe.exec(html)) !== null) ids.push(idm[1]);

    const images: { url: string; alt: string }[] = [];
    const imgRe = /<img\s+data-src="([^"]+)"[^>]*alt="([^"]+)"/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(html)) !== null) images.push({ url: im[1], alt: im[2] });

    const results: MangaCard[] = [];
    const seen = new Set<string>();
    const n = Math.min(ids.length, images.length);
    for (let i = 0; i < n; i++) {
      const id = ids[i];
      if (seen.has(id)) continue;
      seen.add(id);
      const alt = images[i].alt;
      const title = decodeHtmlEntities(alt.split(' ' + alt.split(' ')[0])[0] || alt);
      results.push({ id, title, image: images[i].url, url: `${BASE}/manga/${id}`, provider: 'MangaPill' });
    }
    return { currentPage: page, hasNextPage: html.includes(`page=${page + 1}"`), results };
  });

export interface HomeData {
  featuredChapters: {
    chapterId: string; chapterNumber: string; chapterTitle: string; mangaId: string; mangaTitle: string; image: string;
  }[];
  trendingManga: MangaCard[];
}

export const home = (): Promise<HomeData> =>
  cached('home', 5 * 60_000, async () => {
    const html = await fetchHtml(BASE);

    const featuredChapters: HomeData['featuredChapters'] = [];
    const fRe =
      /<a\s+href="\/chapters\/([^"]+)"[^>]*>\s*<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<a\s+href="\/manga\/([^"]+)">\s*<div[^>]*>([^<]+)<\/div>/gi;
    let fm: RegExpExecArray | null;
    let count = 0;
    while ((fm = fRe.exec(html)) !== null && count < 12) {
      const alt = fm[3];
      const num = alt.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      featuredChapters.push({
        chapterId: fm[1], chapterNumber: num ? num[1] : 'Unknown', chapterTitle: alt,
        mangaId: fm[4], mangaTitle: decodeHtmlEntities(fm[5].trim()), image: fm[2],
      });
      count++;
    }

    const trendingManga: MangaCard[] = [];
    const trendingSection = html.split('Trending Mangas')[1] || '';
    const tRe =
      /<a\s+href="\/manga\/([^"]+)"[^>]*class="relative block"[^>]*>[\s\S]*?<img[^>]*data-src="([^"]+)"[^>]*>[\s\S]*?<a[^>]*href="\/manga\/[^"]+"[^>]*>\s*<div[^>]*>([^<]+)<\/div>/gi;
    let tm: RegExpExecArray | null;
    let tc = 0;
    while ((tm = tRe.exec(trendingSection)) !== null && tc < 10) {
      trendingManga.push({ id: tm[1], title: decodeHtmlEntities(tm[3].trim()), image: tm[2], url: `${BASE}/manga/${tm[1]}` });
      tc++;
    }

    return { featuredChapters, trendingManga };
  });

export const trending = async (): Promise<MangaCard[]> => (await home()).trendingManga;

export const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Harem', 'Historical',
  'Horror', 'Isekai', 'Josei', 'Magic', 'Martial Arts', 'Mature', 'Mecha', 'Mystery',
  'Psychological', 'Romance', 'School Life', 'Sci-Fi', 'Seinen', 'Shoujo', 'Shounen',
  'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Tragedy',
];
export const TYPES = ['manga', 'manhwa', 'manhua', 'one-shot', 'doujinshi'];
export const STATUSES = ['publishing', 'finished', 'on hiatus', 'discontinued'];

// --- image proxy -------------------------------------------------------------
const refererFor = (imageUrl: string): string => {
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    if (host.includes('komikstation') || host.includes('klikcdn')) return 'https://komikstation.org/';
    if (host.includes('comick')) return 'https://comick.art/';
  } catch {
    /* ignore */
  }
  return 'https://mangapill.com/';
};

export interface ProxiedImage {
  body: ArrayBuffer;
  contentType: string;
}

/** Fetch a manga CDN image with the correct referer so hotlink protection passes. */
export const proxyImage = async (imageUrl: string): Promise<ProxiedImage> => {
  const res = await fetch(imageUrl, {
    headers: {
      Accept: 'image/webp,image/avif,image/*,*/*;q=0.8',
      'User-Agent': DEFAULT_HEADERS['User-Agent'],
      Referer: refererFor(imageUrl),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Image fetch ${res.status}`);
  return { body: await res.arrayBuffer(), contentType: res.headers.get('Content-Type') || 'image/jpeg' };
};

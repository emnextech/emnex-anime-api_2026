/**
 * Anime news aggregator.
 *
 * KickAssAnime has no news feed, so we pull headlines from public RSS feeds
 * (Anime News Network + Crunchyroll News), normalise them, merge, sort by date,
 * and cache the result for a few minutes. Per-title news comes from Jikan
 * (MyAnimeList), which — unlike a global feed — ships article thumbnails.
 */

export interface NewsItem {
  id: string | null;
  title: string | null;
  description: string | null;
  thumbnail: string | null;
  uploadedAt: string | null; // ISO date when parseable
  url: string | null;
  source: string; // "Anime News Network" | "Crunchyroll" | "MyAnimeList"
  category: string | null;
}

interface Feed {
  url: string;
  source: string;
}

const FEEDS: Feed[] = [
  { url: 'https://www.animenewsnetwork.com/news/rss.xml', source: 'Anime News Network' },
  { url: 'https://www.crunchyroll.com/news/rss', source: 'Crunchyroll' },
];

const NEWS_TTL = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT = 12000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

let newsCache: { at: number; items: NewsItem[] } | null = null;
let newsPromise: Promise<NewsItem[]> | null = null;

const stripCdata = (s: string): string =>
  s.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();

const stripTags = (s: string): string => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ');

const clean = (s?: string | null): string | null => {
  if (!s) return null;
  const out = decodeEntities(stripTags(stripCdata(s)));
  return out || null;
};

const tag = (block: string, name: string): string | null => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
};

/** Pull an image URL out of an item block (enclosure, media:content, or <img>). */
const imageFrom = (block: string): string | null => {
  const enc = block.match(/<enclosure[^>]*url="([^"]+)"/i);
  if (enc) return enc[1];
  const media = block.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i);
  if (media) return media[1];
  const img = block.match(/<img[^>]*src="([^"]+)"/i);
  if (img) return img[1];
  return null;
};

const toIso = (d?: string | null): string | null => {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

const parseFeed = (xml: string, source: string): NewsItem[] => {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const items: NewsItem[] = [];
  for (const block of blocks) {
    const title = clean(tag(block, 'title'));
    const link = clean(tag(block, 'link'));
    if (!title) continue;
    const desc = clean(tag(block, 'description'));
    items.push({
      id: link ? link.split('/').filter(Boolean).pop() || null : null,
      title,
      description: desc && desc.length > 300 ? desc.slice(0, 300) + '…' : desc,
      thumbnail: imageFrom(block),
      uploadedAt: toIso(tag(block, 'pubDate')),
      url: link,
      source,
      category: clean(tag(block, 'category')),
    });
  }
  return items;
};

const fetchFeed = async (feed: Feed): Promise<NewsItem[]> => {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed.source);
  } catch {
    return [];
  }
};

const buildNews = async (): Promise<NewsItem[]> => {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const merged = results.flat();
  merged.sort((a, b) => {
    const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
    const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
    return tb - ta;
  });
  return merged;
};

/** Aggregated latest anime news, cached ~10 minutes. */
export const getNews = async (limit = 40): Promise<NewsItem[]> => {
  if (newsCache && Date.now() - newsCache.at < NEWS_TTL) {
    return newsCache.items.slice(0, limit);
  }
  if (!newsPromise) {
    newsPromise = buildNews()
      .then(items => {
        // Keep the cache only if we actually got something.
        if (items.length) newsCache = { at: Date.now(), items };
        newsPromise = null;
        return items;
      })
      .catch(err => {
        newsPromise = null;
        throw err;
      });
  }
  const items = await newsPromise;
  return items.slice(0, limit);
};

// ---------------------------------------------------------------------------
// Per-title news via Jikan (MyAnimeList) — includes article thumbnails.
// ---------------------------------------------------------------------------
interface JikanNews {
  mal_id: number;
  url: string;
  title: string;
  date: string;
  excerpt?: string;
  images?: { jpg?: { image_url?: string } };
}

const titleNewsCache = new Map<string, { at: number; items: NewsItem[] }>();
const TITLE_NEWS_TTL = 30 * 60 * 1000; // 30 minutes

const jikan = async <T>(path: string): Promise<T | null> => {
  try {
    const res = await fetch(`https://api.jikan.moe/v4${path}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

/** News articles for a single anime, matched by title through MyAnimeList. */
export const getNewsByTitle = async (title: string, limit = 8): Promise<NewsItem[]> => {
  const key = title.trim().toLowerCase();
  if (!key) return [];

  const cached = titleNewsCache.get(key);
  if (cached && Date.now() - cached.at < TITLE_NEWS_TTL) return cached.items.slice(0, limit);

  const search = await jikan<{ data?: { mal_id: number }[] }>(
    `/anime?q=${encodeURIComponent(title)}&limit=1&sfw`
  );
  const malId = search?.data?.[0]?.mal_id;
  if (!malId) {
    titleNewsCache.set(key, { at: Date.now(), items: [] });
    return [];
  }

  const news = await jikan<{ data?: JikanNews[] }>(`/anime/${malId}/news`);
  const items: NewsItem[] = (news?.data ?? []).map(n => ({
    id: String(n.mal_id),
    title: n.title || null,
    description: n.excerpt ? clean(n.excerpt) : null,
    thumbnail: n.images?.jpg?.image_url || null,
    uploadedAt: toIso(n.date),
    url: n.url || null,
    source: 'MyAnimeList',
    category: null,
  }));

  titleNewsCache.set(key, { at: Date.now(), items });
  return items.slice(0, limit);
};

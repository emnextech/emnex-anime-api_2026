/**
 * Intro/outro skip times.
 *
 * The KAA upstream has no skip data, so we resolve the title to a MyAnimeList id
 * (via Jikan) and query AniSkip — the community skip-times database keyed by
 * MAL id + episode number. Results are cached to stay within rate limits.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const TIMEOUT = 12000;

export interface SkipInterval {
  start: number;
  end: number;
}
export interface SkipTimes {
  op: SkipInterval | null;
  ed: SkipInterval | null;
  malId: number | null;
}

const malCache = new Map<string, { at: number; id: number | null }>();
const skipCache = new Map<string, { at: number; value: SkipTimes }>();
const MAL_TTL = 6 * 60 * 60 * 1000; // 6h
const SKIP_TTL = 6 * 60 * 60 * 1000; // 6h

const jget = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const malIdByTitle = async (title: string): Promise<number | null> => {
  const key = title.trim().toLowerCase();
  if (!key) return null;
  const hit = malCache.get(key);
  if (hit && Date.now() - hit.at < MAL_TTL) return hit.id;

  const data = await jget<{ data?: { mal_id: number }[] }>(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1&sfw`
  );
  const id = data?.data?.[0]?.mal_id ?? null;
  malCache.set(key, { at: Date.now(), id });
  return id;
};

interface AniSkipResult {
  interval: { startTime: number; endTime: number };
  skipType: 'op' | 'ed' | string;
}

/** Resolve op/ed skip intervals for a given title + episode number. */
export const getSkipTimes = async (
  title: string,
  episode: number,
  duration = 0
): Promise<SkipTimes> => {
  const empty: SkipTimes = { op: null, ed: null, malId: null };
  if (!title || !episode) return empty;

  const cacheKey = `${title.toLowerCase()}::${episode}`;
  const cached = skipCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SKIP_TTL) return cached.value;

  const malId = await malIdByTitle(title);
  if (!malId) {
    const value = { ...empty };
    skipCache.set(cacheKey, { at: Date.now(), value });
    return value;
  }

  const len = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
  const data = await jget<{ found: boolean; results?: AniSkipResult[] }>(
    `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types=op&types=ed&episodeLength=${len}`
  );

  const value: SkipTimes = { op: null, ed: null, malId };
  for (const r of data?.results ?? []) {
    const interval = { start: r.interval.startTime, end: r.interval.endTime };
    if (r.skipType === 'op') value.op = interval;
    else if (r.skipType === 'ed') value.ed = interval;
  }
  skipCache.set(cacheKey, { at: Date.now(), value });
  return value;
};

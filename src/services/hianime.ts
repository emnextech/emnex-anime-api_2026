/**
 * HiAnime adapter (via the `aniwatch` npm package).
 *
 * A secondary DIRECT-stream source: HiAnime/megacloud returns real HLS (.m3u8)
 * manifests + .vtt subtitles + intro/outro markers — so it plays in our own
 * player (unlike the enma iframe embeds). Keyed by title + episode number, since
 * our catalogue ids are KAA slugs.
 *
 * NOTE: the megacloud m3u8/segments require a Referer; the /proxy already carries
 * a `ref` param through the whole playlist, so we only surface the referer here.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { HiAnime } from 'aniwatch';

const hianime = new HiAnime.Scraper();

const RESOLVE_TTL = 30 * 60 * 1000;
const MEGACLOUD_REFERER = 'https://megacloud.blog/';

interface Resolved {
  animeId: string;
  episodes: { number: number; episodeId: string }[];
}

const resolveCache = new Map<string, { at: number; data: Resolved | null }>();

/** Search HiAnime for a title and cache its animeId + episode list. */
const resolveAnime = async (title: string): Promise<Resolved | null> => {
  const key = title.trim().toLowerCase();
  if (!key) return null;
  const hit = resolveCache.get(key);
  if (hit && Date.now() - hit.at < RESOLVE_TTL) return hit.data;

  let data: Resolved | null = null;
  try {
    const search = await hianime.search(title);
    const animeId = search.animes?.[0]?.id;
    if (animeId) {
      const eps = await hianime.getEpisodes(animeId);
      data = {
        animeId,
        episodes: (eps.episodes || []).map(e => ({ number: e.number, episodeId: e.episodeId })),
      };
    }
  } catch {
    data = null;
  }
  resolveCache.set(key, { at: Date.now(), data });
  return data;
};

const episodeIdFor = (r: Resolved, epNumber: number): string | null =>
  (r.episodes.find(e => e.number === epNumber) || r.episodes[epNumber - 1])?.episodeId || null;

export interface HiAnimeServers {
  sub: string[];
  dub: string[];
  raw: string[];
}

/** Server names available for one episode (by title + episode number). */
export const servers = async (title: string, epNumber: number): Promise<HiAnimeServers> => {
  const resolved = await resolveAnime(title);
  if (!resolved) return { sub: [], dub: [], raw: [] };
  const episodeId = episodeIdFor(resolved, epNumber);
  if (!episodeId) return { sub: [], dub: [], raw: [] };

  const s = await hianime.getEpisodeServers(episodeId);
  const names = (arr?: { serverName: string }[]) => (arr || []).map(x => x.serverName);
  return { sub: names(s.sub), dub: names(s.dub), raw: names(s.raw) };
};

export interface HiAnimeSources {
  category: string;
  server: string;
  sources: { url: string; isM3U8?: boolean }[];
  subtitles: { lang: string; label: string; url: string }[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  referer: string;
}

/** Resolve an episode + server to a direct HLS manifest + subtitles. */
export const sources = async (
  title: string,
  epNumber: number,
  server: string,
  category: 'sub' | 'dub' | 'raw'
): Promise<HiAnimeSources | null> => {
  const resolved = await resolveAnime(title);
  if (!resolved) return null;
  const episodeId = episodeIdFor(resolved, epNumber);
  if (!episodeId) return null;

  const data = await hianime.getEpisodeSources(
    episodeId,
    server.toLowerCase() as unknown as Parameters<typeof hianime.getEpisodeSources>[1],
    category
  );

  const referer =
    ((data.headers as Record<string, string> | undefined)?.Referer as string) || MEGACLOUD_REFERER;

  const subtitles = (data.subtitles || [])
    .filter(t => t.url && t.url.toLowerCase().endsWith('.vtt') && (t.lang || '').toLowerCase() !== 'thumbnails')
    .map(t => ({ lang: t.lang, label: t.lang, url: t.url }));

  return {
    category,
    server,
    sources: (data.sources || []).map(s => ({ url: s.url, isM3U8: s.isM3U8 })),
    subtitles,
    intro: data.intro ?? null,
    outro: data.outro ?? null,
    referer,
  };
};

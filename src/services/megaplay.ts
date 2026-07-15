/**
 * MegaPlay adapter — a DIRECT-stream source.
 *
 * megaplay.buzz is a megacloud proxy whose `getSources` endpoint returns a plain
 * (unencrypted) HLS .m3u8 manifest + subtitle tracks — so it plays in our own
 * player, not an iframe. Keyed by AniList id (or MAL id) + episode + sub/dub.
 *
 *   embed page:  /stream/{ani|mal}/{id}/{ep}/{sub|dub}   → has data-id="NNNN"
 *   sources:     /stream/getSources?id=NNNN              → { sources:{file}, tracks:[] }
 *
 * The manifest/segments require Referer: megaplay.buzz — surfaced here so /proxy
 * carries it through the whole playlist.
 */
const MEGA = 'https://megaplay.buzz';
export const MEGAPLAY_REFERER = 'https://megaplay.buzz/';
const TIMEOUT = 15000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

/** Fetch an episode's embed page and pull out its internal source id. */
const embedDataId = async (
  anilistId: string | number,
  ep: string | number,
  category: 'sub' | 'dub'
): Promise<string | null> => {
  try {
    const res = await fetch(`${MEGA}/stream/ani/${anilistId}/${ep}/${category}`, {
      headers: { 'User-Agent': UA, Referer: MEGAPLAY_REFERER },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.match(/data-id="(\d+)"/)?.[1] || null;
  } catch {
    return null;
  }
};

interface RawSources {
  file: string;
  tracks: { file: string; label: string; kind: string }[];
}

const getSources = async (dataId: string): Promise<RawSources | null> => {
  try {
    const res = await fetch(`${MEGA}/stream/getSources?id=${dataId}`, {
      headers: { 'User-Agent': UA, Referer: MEGAPLAY_REFERER, 'X-Requested-With': 'XMLHttpRequest' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      sources?: { file?: string };
      tracks?: { file: string; label: string; kind: string }[];
    };
    const file = data?.sources?.file;
    if (!file) return null;
    return { file, tracks: Array.isArray(data.tracks) ? data.tracks : [] };
  } catch {
    return null;
  }
};

/** Which categories (sub/dub) are available for this episode. */
export const servers = async (
  anilistId: string | number,
  ep: string | number
): Promise<{ sub: boolean; dub: boolean }> => {
  const [sub, dub] = await Promise.all([
    embedDataId(anilistId, ep, 'sub'),
    embedDataId(anilistId, ep, 'dub'),
  ]);
  return { sub: Boolean(sub), dub: Boolean(dub) };
};

export interface MegaplaySources {
  file: string;
  referer: string;
  subtitles: { lang: string; label: string; url: string }[];
}

/** Resolve an episode + category to a direct HLS manifest + subtitles. */
export const sources = async (
  anilistId: string | number,
  ep: string | number,
  category: 'sub' | 'dub'
): Promise<MegaplaySources | null> => {
  const dataId = await embedDataId(anilistId, ep, category);
  if (!dataId) return null;
  const raw = await getSources(dataId);
  if (!raw) return null;

  const subtitles = raw.tracks
    .filter(t => t.kind === 'captions' && t.file && t.file.toLowerCase().endsWith('.vtt'))
    .map(t => ({ lang: t.label, label: t.label, url: t.file }))
    // English first (default), then the rest.
    .sort((a, b) => (/eng/i.test(b.label) ? 1 : 0) - (/eng/i.test(a.label) ? 1 : 0));

  return { file: raw.file, referer: MEGAPLAY_REFERER, subtitles };
};

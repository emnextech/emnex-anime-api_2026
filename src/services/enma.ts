/**
 * enma.lol adapter — a secondary source that exposes many iframe-embed servers
 * (5 sub + 5 dub) keyed by AniList id, with built-in intro/outro skip. Its API
 * gates on the Origin header, so it can only be reached server-side (here).
 */
const ENMA_API = 'https://api.enma.lol/api';
const TIMEOUT = 15000;

const ENMA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  Accept: 'application/json',
  Origin: 'https://www.enma.lol',
  Referer: 'https://www.enma.lol/',
};

const enmaGet = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${ENMA_API}${path}`, {
    headers: ENMA_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`enma upstream ${res.status}`);
  return (await res.json()) as T;
};

export interface EnmaServer {
  type: 'sub' | 'dub';
  serverName: string;
  data_id?: string;
}

/** GET /servers/:anilistId?ep=N — the sub/dub server list for one episode. */
export const servers = async (anilistId: string, ep: string | number): Promise<EnmaServer[]> => {
  const data = await enmaGet<{ success: boolean; results?: EnmaServer[] }>(
    `/servers/${anilistId}?ep=${ep}`
  );
  return Array.isArray(data.results) ? data.results : [];
};

export interface EnmaStream {
  iframe: string | null;
  server: string;
  type: string;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

/**
 * GET /stream?id=<anilistId>?ep=N&server=hd-1&type=sub — resolves a server to a
 * playable iframe embed (+ intro/outro markers when the provider gives them).
 */
export const stream = async (
  anilistId: string,
  ep: string | number,
  server: string,
  type: string,
  opts: { skipIntro?: boolean; skipOutro?: boolean } = {}
): Promise<EnmaStream> => {
  const params = new URLSearchParams({
    id: `${anilistId}?ep=${ep}`,
    server: server.toLowerCase(),
    type: type.toLowerCase(),
  });
  if (opts.skipIntro) params.set('skipIntro', '1');
  if (opts.skipOutro) params.set('skipOutro', '1');

  const data = await enmaGet<{
    success: boolean;
    results?: { streamingLink?: Record<string, unknown> };
  }>(`/stream?${params.toString()}`);

  const sl = (data.results?.streamingLink || {}) as {
    iframe?: string;
    server?: string;
    type?: string;
    intro?: { start: number; end: number } | null;
    outro?: { start: number; end: number } | null;
  };

  return {
    iframe: sl.iframe || null,
    server: sl.server || server,
    type: sl.type || type,
    intro: sl.intro ?? null,
    outro: sl.outro ?? null,
  };
};

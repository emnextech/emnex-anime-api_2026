import { Context } from 'hono';

/**
 * HLS / media proxy.
 *
 * The upstream stream host rejects requests without a Referer and sends no CORS
 * headers, so browsers cannot play it directly. This handler injects the Referer,
 * adds permissive CORS headers, and rewrites m3u8 playlists so every nested
 * playlist / segment / key request is routed back through this same proxy.
 *
 *   GET /api/v2/proxy?url=<absolute media url>&ref=<optional referer>
 */

const DEFAULT_REFERER = 'https://krussdomi.com/';
const PROXY_PATH = '/api/v2/proxy';

const isPlaylist = (url: string, contentType: string): boolean =>
  url.toLowerCase().includes('.m3u8') ||
  contentType.includes('mpegurl') ||
  contentType.includes('vnd.apple.mpegurl');

const wrap = (absolute: string, ref: string): string =>
  `${PROXY_PATH}?url=${encodeURIComponent(absolute)}&ref=${encodeURIComponent(ref)}`;

// Rewrite every URI in an m3u8 to point back at this proxy (relative URLs are
// resolved against the playlist's own URL first).
const rewritePlaylist = (body: string, manifestUrl: string, ref: string): string =>
  body
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        // Rewrite URI="..." attributes (EXT-X-MEDIA, EXT-X-KEY, etc.)
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          const abs = new URL(uri, manifestUrl).toString();
          return `URI="${wrap(abs, ref)}"`;
        });
      }

      // Bare line = a variant playlist or media segment
      const abs = new URL(trimmed, manifestUrl).toString();
      return wrap(abs, ref);
    })
    .join('\n');

const proxyController = async (c: Context) => {
  const target = c.req.query('url');
  const ref = c.req.query('ref') || DEFAULT_REFERER;

  if (!target) {
    return c.json({ success: false, message: 'url query param is required' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        Referer: ref,
        Origin: new URL(ref).origin,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        Accept: '*/*',
      },
    });
  } catch {
    return c.json({ success: false, message: 'failed to reach upstream media' }, 502);
  }

  if (!upstream.ok) {
    return c.json({ success: false, message: `upstream responded ${upstream.status}` }, 502);
  }

  const contentType = upstream.headers.get('content-type') || '';
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-cache',
  };

  if (isPlaylist(target, contentType)) {
    const body = await upstream.text();
    const rewritten = rewritePlaylist(body, target, ref);
    return c.body(rewritten, 200, {
      ...cors,
      'Content-Type': 'application/vnd.apple.mpegurl',
    });
  }

  // Segments / subtitles / keys — stream bytes straight through.
  const buf = await upstream.arrayBuffer();
  return c.body(buf, 200, {
    ...cors,
    'Content-Type': contentType || 'application/octet-stream',
  });
};

export default proxyController;

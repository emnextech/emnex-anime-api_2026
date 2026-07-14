import { Context } from 'hono';
import { HiAnime } from 'aniwatch';

// Temporary diagnostic. Probes candidate HiAnime mirrors from the server to find
// one that serves real listing HTML (the scraper looks for `.flw-item` cards),
// and reports the current scraper result. Remove once a domain is chosen.
const CANDIDATES = [
  'hianime.to',
  'hianime.nz',
  'hianime.pe',
  'hianime.bz',
  'hianime.gs',
  'hianimez.to',
  'aniwatchtv.to',
  'kaido.to',
  'watchanimeworld.in',
];

const hianimeDebugController = async (c: Context) => {
  const title = c.req.query('title') || 'one piece';
  const out: Record<string, unknown> = { defaultDomain: process.env.ANIWATCH_DOMAIN || '(baked default)' };

  // 1) which mirrors are alive + serve HiAnime listing HTML?
  const probes: Record<string, string> = {};
  await Promise.all(
    CANDIDATES.map(async d => {
      try {
        const r = await fetch(`https://${d}/home`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0 Safari/537.36' },
          signal: AbortSignal.timeout(12000),
        });
        const html = await r.text();
        const hasCards = html.includes('flw-item') || html.includes('film_list');
        probes[d] = `${r.status}${hasCards ? ' HIANIME-HTML' : ''}`;
      } catch (e) {
        probes[d] = e instanceof Error ? e.name : 'err';
      }
    })
  );
  out.mirrors = probes;

  // 2) current scraper result against the default domain
  try {
    const search = await new HiAnime.Scraper().search(title);
    out.searchCount = search.animes?.length ?? 0;
    out.firstName = search.animes?.[0]?.name ?? null;
  } catch (e: unknown) {
    out.searchError = e instanceof Error ? e.message : String(e);
  }
  return out;
};

export default hianimeDebugController;

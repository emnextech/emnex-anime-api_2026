import { Context } from 'hono';
import { HiAnime } from 'aniwatch';

// Temporary diagnostic: surfaces exactly where the HiAnime scraper fails
// (domain reachability vs. broken HTML parsing). Remove once confirmed.
const hianimeDebugController = async (c: Context) => {
  const title = c.req.query('title') || 'one piece';
  const hianime = new HiAnime.Scraper();
  const out: Record<string, unknown> = {
    domain: process.env.ANIWATCH_DOMAIN || '(default)',
  };
  try {
    const search = await hianime.search(title);
    out.searchCount = search.animes?.length ?? 0;
    out.firstAnime = search.animes?.[0]?.id ?? null;
    out.firstName = search.animes?.[0]?.name ?? null;
    if (search.animes?.[0]?.id) {
      const eps = await hianime.getEpisodes(search.animes[0].id);
      out.totalEpisodes = eps.totalEpisodes;
      out.firstEpisodeId = eps.episodes?.[0]?.episodeId ?? null;
    }
  } catch (e: unknown) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
};

export default hianimeDebugController;

import { Context } from 'hono';
import { CharactersResponse } from '../extractor/extractCharacters';

// KickAssAnime has no character data; return a valid empty payload.
const charactersController = async (_c?: Context): Promise<CharactersResponse> => {
  return {
    pageInfo: { totalPages: 1, currentPage: 1, hasNextPage: false },
    response: [],
  };
};

export default charactersController;

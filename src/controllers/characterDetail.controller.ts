import { Context } from 'hono';
import { CharacterDetail } from '../extractor/extractCharacterDetail';
import { validationError } from '../utils/errors';

// KickAssAnime has no character data; return a valid empty payload.
const characterDetailConroller = async (c: Context): Promise<CharacterDetail> => {
  const id = c.req.param('id');
  if (!id) throw new validationError('id is required');

  return {
    name: null,
    type: id.startsWith('people') ? 'people' : 'character',
    japanese: null,
    imageUrl: null,
    bio: null,
    animeAppearances: [],
    voiceActors: [],
    voiceActingRoles: [],
  };
};

export default characterDetailConroller;

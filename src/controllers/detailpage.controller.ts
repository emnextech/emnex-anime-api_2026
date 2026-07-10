import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { validationError } from '../utils/errors';
import { DetailAnime } from '../types/anime';

const detailpageController = async (c: Context): Promise<DetailAnime> => {
  const id = c.req.param('id');

  if (!id) throw new validationError('id is required');

  let show;
  try {
    show = await kaa.detail(id);
  } catch {
    throw new validationError('Failed to fetch detail page', 'maybe id is incorrect : ' + id);
  }

  let epList: kaa.KaaEpisode[] = [];
  try {
    epList = await kaa.episodes(id);
  } catch {
    // detail should still return even if episode listing fails
  }

  return kaa.mapDetail(show, epList);
};

export default detailpageController;

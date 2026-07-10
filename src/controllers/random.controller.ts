import { Context } from 'hono';
import * as kaa from '../services/kaa';
import { validationError } from '../utils/errors';

const randomController = async (_c?: Context): Promise<{ id: string }> => {
  const page = Math.floor(Math.random() * 20) + 1;
  const { result } = await kaa.popular(page);

  if (result.length === 0) throw new validationError('No anime found');

  const random = result[Math.floor(Math.random() * result.length)];
  return { id: random.slug };
};

export default randomController;

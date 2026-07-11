import { Context } from 'hono';
import { getSkipTimes } from '../services/skip';
import { validationError } from '../utils/errors';

/** GET /episode/skip-times?title=&episode=&duration= — op/ed skip intervals. */
const skipTimesController = async (c: Context) => {
  const title = c.req.query('title');
  const episode = Number(c.req.query('episode'));
  const duration = Number(c.req.query('duration')) || 0;

  if (!title) throw new validationError('title query param is required');
  if (!episode) throw new validationError('episode query param is required');

  return getSkipTimes(title, episode, duration);
};

export default skipTimesController;

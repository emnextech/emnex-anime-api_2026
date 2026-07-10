import { Context } from 'hono';
import { validationError } from '../utils/errors';
import { ScheduledAnime } from '../extractor/extractSchedule';

export interface ScheduleResponse {
  [date: string]: ScheduledAnime[];
}

// KickAssAnime does not expose an airing schedule feed, so we return the
// standard 7-day map with empty day buckets (no upstream calls to make).
// The handler adds the { success, data } envelope, so we return the map directly.
async function schedulesController(c: Context): Promise<ScheduleResponse> {
  const dateParam = c.req.query('date');

  let startDate = new Date();
  if (dateParam) {
    const [year, month, day] = dateParam.split('-').map(Number);
    startDate = new Date(year, month - 1, day);
    if (isNaN(startDate.getTime())) {
      throw new validationError('Invalid date format. Use YYYY-MM-DD');
    }
  }

  const data: { [date: string]: ScheduledAnime[] } = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    data[key] = [];
  }

  return data;
}

export default schedulesController;

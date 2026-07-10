import { Context } from 'hono';
import * as kaa from '../services/kaa';

/**
 * GET /api/v2/schedules
 * Returns upcoming anime airings from the upstream schedule as a flat list
 * (sorted by airing time). Each item carries `airingAt` (ms epoch) so clients
 * can group by day and render times in the viewer's local timezone.
 */
async function schedulesController(_c: Context): Promise<kaa.ScheduleItem[]> {
  try {
    return await kaa.schedule();
  } catch {
    return [];
  }
}

export default schedulesController;

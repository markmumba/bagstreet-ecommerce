import type { AppContext } from '@server/lib/hono';
import { success } from '@server/lib/response';
import { dashboardQueries } from './dashboard.queries';

export const dashboardHandlers = {
    overview: async (c: AppContext) => {
        const overview = await dashboardQueries.overview();
        return success(c, overview);
    },
};

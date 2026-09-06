import { Router } from 'express';
import { isAdmin } from '../../auth/middleware';
import { ProductMaintenanceService } from '../../services/ProductMaintenanceService';
export function createMaintenanceRouter(service = new ProductMaintenanceService()) {
    const router = Router();
    router.use(isAdmin);
    router.get('/overview', async (_req, res, next) => {
        try {
            res.json(await service.overview());
        } catch (error) {
            next(error);
        }
    });
    router.get('/suggestions', async (req, res, next) => {
        const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
        const country = req.query.country_id;
        if (!['pending', 'approved', 'rejected', 'undone'].includes(status) || (country !== undefined && (typeof country !== 'string' || !/^\d+$/.test(country)))) {
            res.status(400).json({ error: 'Invalid filters' });
            return;
        }
        try {
            res.json(await service.suggestions(status, country as string | undefined));
        }
        catch (e) {
            next(e);
        }
    });
    router.post('/run', async (req, res, next) => {
        const { limit = 10, dry_run = false } = req.body || {};
        if (!Number.isInteger(limit) || limit < 1 || limit > 25 || typeof dry_run !== 'boolean') {
            res.status(400).json({ error: 'Invalid run options' });
            return;
        }
        try {
            res.json(await service.run(limit, dry_run));
        }
        catch (e) {
            next(e);
        }
    });
    for (const action of ['approve', 'reject', 'undo'] as const) {
        router.post(`/suggestions/:id/${action}`, async (req, res) => {
            if (!/^\d+$/.test(req.params.id) || (req.body?.reason !== undefined && (typeof req.body.reason !== 'string' || req.body.reason.length > 2000))) {
                res.status(400).json({ error: 'Invalid review request' });
                return;
            }
            try {
                res.json(await service.review(req.params.id, action, String(req.user?.id), req.body?.reason));
            }
            catch (e) {
                res.status(409).json({ error: e instanceof Error ? e.message : 'Review conflict' });
            }
        });
    }
    return router;
}
export default createMaintenanceRouter();

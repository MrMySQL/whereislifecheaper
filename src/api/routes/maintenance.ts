import { Router, Request } from 'express';
import { MaintenanceConflictError, MaintenanceNotFoundError } from '../../types/maintenance.types';

function pageOptions(query: Request['query']) {
    const integer = (value: unknown, fallback: number, minimum: number, maximum: number) => {
        if (value === undefined) return fallback;
        if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
    };
    const limit = integer(query.limit, 100, 1, 200);
    const offset = integer(query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    return limit === null || offset === null ? null : { limit, offset };
}
function validCountry(country: unknown): country is string | undefined {
    return country === undefined || (typeof country === 'string' && /^\d+$/.test(country) && Number(country) <= 2147483647);
}

import { isAdmin } from '../../auth/middleware';
import { ProductMaintenanceService } from '../../services/ProductMaintenanceService';
export function createMaintenanceRouter(service = new ProductMaintenanceService()) {
    const router = Router();
    router.use(isAdmin);
    router.get('/overview', async (req, res, next) => {
        const page = pageOptions(req.query);
        const country = req.query.country_id;
        const gapsOnly = req.query.gaps_only;
        if (!page || !validCountry(country) || (gapsOnly !== undefined && gapsOnly !== 'true' && gapsOnly !== 'false')) {
            res.status(400).json({ error: 'Invalid filters' });
            return;
        }
        try {
            res.json(await service.overview({ ...page, country, gapsOnly: gapsOnly === 'true' }));
        } catch (error) {
            next(error);
        }
    });
    router.get('/suggestions', async (req, res, next) => {
        const status = req.query.status === undefined ? 'pending' : req.query.status;
        const country = req.query.country_id;
        const page = pageOptions(req.query);
        if (!page || typeof status !== 'string' || !['pending', 'approved', 'rejected', 'undone'].includes(status) || !validCountry(country)) {
            res.status(400).json({ error: 'Invalid filters' });
            return;
        }
        try {
            res.json(await service.suggestions(status, country, page));
        }
        catch (e) {
            next(e);
        }
    });
    router.post('/run', async (req, res, next) => {
        const { limit = 10, dry_run = true } = req.body || {};
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
        router.post(`/suggestions/:id/${action}`, async (req, res, next) => {
            if (!/^\d+$/.test(req.params.id) || (req.body?.reason !== undefined && (typeof req.body.reason !== 'string' || req.body.reason.length > 2000))) {
                res.status(400).json({ error: 'Invalid review request' });
                return;
            }
            try {
                res.json(await service.review(req.params.id, action, String(req.user?.id), req.body?.reason));
            }
            catch (e) {
                if (e instanceof MaintenanceNotFoundError) res.status(404).json({ error: e.message });
                else if (e instanceof MaintenanceConflictError) res.status(409).json({ error: e.message });
                else next(e);
            }
        });
    }
    return router;
}
export default createMaintenanceRouter();

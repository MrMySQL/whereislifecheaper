import { ProductMaintenanceRepository } from '../repositories/ProductMaintenanceRepository';
import { Candidate, MaintenanceTarget } from '../types/maintenance.types';
import { configuredMaintenanceRanker } from './maintenanceRanker';
import { interpretProductQuantity } from '../utils/productQuantity';
/** Optional assistance receives only eligible database candidates; returned IDs only affect ordering. */
export type CandidateRanker = (target: MaintenanceTarget, candidates: Candidate[]) => Promise<string[]>;
export class ProductMaintenanceService {
    constructor(private readonly repository = new ProductMaintenanceRepository(), private readonly ranker: CandidateRanker | undefined = configuredMaintenanceRanker()) { }
    validate(candidate: Candidate, target: MaintenanceTarget) {
        const cutoff = Date.now() - 7 * 86400000;
        if (candidate.canonical_product_id !== null || candidate.availability_status !== 'available'
            || !(new Date(candidate.last_checked_at).getTime() >= cutoff) || !(new Date(candidate.scraped_at).getTime() >= cutoff))
            throw new Error('Candidate is stale, unavailable, or already classified');
        const interpreted = interpretProductQuantity({ name: candidate.name, description: candidate.description, unit: candidate.unit,
            unitQuantity: candidate.unit_quantity == null ? undefined : Number(candidate.unit_quantity), price: Number(candidate.price), priceBasis: candidate.price_basis || candidate.quantity_info?.priceBasis });
        const quantity = candidate.quantity_info || interpreted;
        if (quantity.status !== interpreted.status || quantity.contentUnit !== interpreted.contentUnit || quantity.contentQuantity !== interpreted.contentQuantity || quantity.priceBasis !== interpreted.priceBasis || quantity.comparablePrice !== interpreted.comparablePrice)
            throw new Error('Price snapshot disagrees with current listing');
        if ((target.excluded_terms || []).some(term => candidate.name.toLocaleLowerCase().includes(term.toLocaleLowerCase())))
            throw new Error('Excluded product form');
        const expected = interpretProductQuantity({ name: target.name, price: 1 });
        const expectedUnit = target.expected_unit || expected.contentUnit;
        const expectedQuantity = target.expected_quantity == null ? expected.contentQuantity : Number(target.expected_quantity);
        if (quantity.status !== 'verified' || !Number.isFinite(quantity.comparablePrice) || !(Number(quantity.comparablePrice) > 0))
            throw new Error('Candidate quantity requires manual investigation');
        if (target.show_per_unit_price && !['kg', 'l'].includes(quantity.contentUnit || ''))
            throw new Error('Per-unit comparison requires mass or volume');
        if (expectedUnit && quantity.contentUnit !== expectedUnit)
            throw new Error('Candidate content unit is incompatible');
        if (!target.show_per_unit_price && expectedQuantity && Math.abs((quantity.contentQuantity || 0) - expectedQuantity) > 0.0001)
            throw new Error('Candidate content quantity is incompatible');
        return quantity;
    }
    async overview() { return { coverage: await this.repository.targets(), runs: await this.repository.runs() }; }
    async suggestions(status?: string, country?: string) { const data = await this.repository.suggestions(status, country); return { data, count: data.length }; }
    async run(limit = 10, dryRun = false) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 25)
            throw new Error('Run limit must be between 1 and 25');
        const run = await this.repository.start(dryRun);
        let scanned = 0, proposed = 0;
        try {
            const targets = await this.repository.targets(limit, true);
            const deadline = Date.now() + 15000;
            for (const target of targets) {
                if (Date.now() > deadline)
                    break;
                scanned++;
                if (!dryRun)
                    await this.repository.markChecked(target);
                const eligible = (await this.repository.candidates(target)).flatMap(candidate => {
                    try {
                        return [{ candidate, quantity: this.validate(candidate, target) }];
                    }
                    catch {
                        return [];
                    }
                });
                if (this.ranker && eligible.length) {
                    // Ranking failure has no effect on deterministic discovery. Cap input and wait time.
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    try {
                        const ids = await Promise.race([this.ranker(target, eligible.slice(0, 20).map(e => e.candidate)),
                            new Promise<string[]>((resolve) => { timer = setTimeout(() => resolve([]), 4500); })]);
                        const rank = new Map(ids.filter(id => eligible.some(e => String(e.candidate.mapping_id) === String(id))).map((id, i) => [String(id), i]));
                        eligible.sort((a, b) => (rank.get(String(a.candidate.mapping_id)) ?? 999) - (rank.get(String(b.candidate.mapping_id)) ?? 999));
                    }
                    catch { /* Assistance is optional. */ }
                    finally {
                        if (timer)
                            clearTimeout(timer);
                    }
                }
                for (const { candidate, quantity } of eligible.slice(0, 5)) {
                    const payload = {
                        quantity,
                        raw: {
                            name: candidate.name,
                            description: candidate.description,
                            unit: candidate.unit,
                            unit_quantity: candidate.unit_quantity,
                            price_basis: candidate.price_basis,
                        },
                        currency: candidate.currency,
                        last_available_at: candidate.last_available_at,
                        availability_status: candidate.availability_status,
                        last_checked_at: candidate.last_checked_at,
                        evidence: [
                            'Fresh available offer',
                            'Keyword candidate from canonical or local examples; semantic match requires human review',
                            ...quantity.evidence,
                        ],
                        price: Number(candidate.price),
                        url: candidate.url,
                    };
                    if (dryRun || await this.repository.propose(target, candidate, payload))
                        proposed++;
                }
            }
            return await this.repository.finish(run.id, scanned, proposed);
        }
        catch (error) {
            await this.repository.finish(run.id, scanned, proposed, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    review(id: string, action: 'approve' | 'reject' | 'undo', actor: string, reason?: string) {
        return this.repository.review(id, action, actor, reason, (candidate, target) => { this.validate(candidate, target); });
    }
}

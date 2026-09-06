import { ProductMaintenanceRepository } from '../repositories/ProductMaintenanceRepository';
import { Candidate, MaintenanceTarget, CoverageOptions, MaintenancePageOptions, MaintenanceConflictError, MaintenanceNotFoundError, CountryRunOptions, MappingPreview, MappingRunResult } from '../types/maintenance.types';
import { configuredMaintenanceRanker } from './maintenanceRanker';
import { mappingVocabulary, VocabularyProvider, translateTexts, COUNTRY_LANGUAGES } from './MappingVocabulary';
import { matchesGroceryType } from './mappingSemantics';
import { interpretProductQuantity } from '../utils/productQuantity';
/** Optional assistance receives only eligible database candidates; returned IDs only affect ordering. */
export type CandidateRanker = (target: MaintenanceTarget, candidates: Candidate[]) => Promise<string[]>;
export class ProductMaintenanceService {
    constructor(private readonly repository = new ProductMaintenanceRepository(), private readonly ranker: CandidateRanker | undefined = configuredMaintenanceRanker(), private readonly vocabularyProvider: VocabularyProvider = mappingVocabulary) { }
    validate(candidate: Candidate, target: MaintenanceTarget) {
        const cutoff = Date.now() - 7 * 86400000;
        if (candidate.canonical_product_id !== null || candidate.availability_status !== 'available'
            || !(new Date(candidate.last_checked_at).getTime() >= cutoff) || !(new Date(candidate.scraped_at).getTime() >= cutoff))
            throw new MaintenanceConflictError('Candidate is stale, unavailable, or already classified');
        const interpreted = interpretProductQuantity({ name: candidate.name, description: candidate.description, unit: candidate.unit,
            unitQuantity: candidate.unit_quantity == null ? undefined : Number(candidate.unit_quantity), price: Number(candidate.price), priceBasis: candidate.price_basis || candidate.quantity_info?.priceBasis });
        const quantity = candidate.quantity_info || interpreted;
        if (quantity.status !== interpreted.status || quantity.contentUnit !== interpreted.contentUnit || quantity.contentQuantity !== interpreted.contentQuantity || quantity.priceBasis !== interpreted.priceBasis || quantity.comparablePrice !== interpreted.comparablePrice)
            throw new MaintenanceConflictError('Price snapshot disagrees with current listing');
        if ((target.excluded_terms || []).some(term => candidate.name.toLocaleLowerCase().includes(term.toLocaleLowerCase())))
            throw new MaintenanceConflictError('Excluded product form');
        const expected = interpretProductQuantity({ name: target.name, price: 1 });
        const expectedUnit = target.expected_unit || expected.contentUnit;
        const expectedQuantity = target.expected_quantity == null ? expected.contentQuantity : Number(target.expected_quantity);
        if (quantity.status !== 'verified' || !Number.isFinite(quantity.comparablePrice) || !(Number(quantity.comparablePrice) > 0))
            throw new MaintenanceConflictError('Candidate quantity requires manual investigation');
        if (target.show_per_unit_price && !['kg', 'l'].includes(quantity.contentUnit || ''))
            throw new MaintenanceConflictError('Per-unit comparison requires mass or volume');
        if (expectedUnit && quantity.contentUnit !== expectedUnit)
            throw new MaintenanceConflictError('Candidate content unit is incompatible');
        if (!target.show_per_unit_price && expectedQuantity && Math.abs((quantity.contentQuantity || 0) - expectedQuantity) > 0.0001)
            throw new MaintenanceConflictError('Candidate content quantity is incompatible');
        return quantity;
    }
    async overview(options: CoverageOptions = {}) { return { ...await this.repository.coverage(options), runs: await this.repository.runs() }; }
    async suggestions(status?: string, country?: string, options: MaintenancePageOptions = {}) { return this.repository.suggestions(status, country, options); }
    async run(limit = 10, dryRun = true, options: CountryRunOptions = {}): Promise<MappingRunResult> {
        if ((options.country !== undefined && !/^[1-9]\d*$/.test(options.country)) || Number(options.country) > 2147483647
            || (options.cursor !== undefined && (!options.country || !/^\d+:\d+$/.test(options.cursor)
                || options.cursor.split(':').some(part => Number(part) > 2147483647)))) throw new Error('Invalid country or cursor');
        if (!Number.isInteger(limit) || limit < 1 || limit > 25)
            throw new Error('Run limit must be between 1 and 25');
        const started_at = new Date().toISOString();
        const run = dryRun ? null : await this.repository.start(false);
        const warnings: string[] = [], previews: MappingPreview[] = [];
        let nextCursor: string | null = null, hasMore = false;
        let scanned = 0, proposed = 0;
        try {
            const targets = options.country ? await this.repository.targets(limit + 1, true, options) : await this.repository.targets(limit, true);
            const deadline = Date.now() + 15000;
            for (const original of targets) {
                if (scanned >= limit || (scanned > 0 && Date.now() > deadline)) { hasMore = true; break; }
                let target = original;
                if (options.country || target.country_code) {
                    try {
                        let aliases = await this.repository.vocabulary(target);
                        if (!aliases.length) {
                            aliases = (await this.vocabularyProvider(target)).filter(a => typeof a === 'string' && a.trim() && a.length <= 300).slice(0, 20);
                            if (!dryRun && aliases.length) await this.repository.saveVocabulary(target, aliases);
                        }
                        target = { ...target, aliases: [...new Set([...(target.aliases || []), ...aliases])] };
                    } catch { warnings.push(`${target.name}: translation unavailable; using existing names and aliases.`); }
                }
                scanned++;
                let eligible = (await this.repository.candidates(target)).flatMap(candidate => {
                    try {
                        return [{ candidate, quantity: this.validate(candidate, target) }];
                    }
                    catch {
                        return [];
                    }
                });
                const translatedNames = new Map<string,string>();
                if ((options.country || target.country_code) && eligible.length) {
                    try {
                        const names=eligible.slice(0,100).map(e=>e.candidate.name.slice(0,1000));
                        const languages=COUNTRY_LANGUAGES[target.country_code || ''];
                        const translated=languages?.length === 1 && languages[0] === 'en' ? names : await translateTexts(names,'en','auto');
                        translated.forEach((name,index)=>translatedNames.set(String(eligible[index].candidate.mapping_id),name));
                        eligible=eligible.slice(0,100).filter(e=>matchesGroceryType(target.name,translatedNames.get(String(e.candidate.mapping_id))!));
                    } catch { warnings.push(`${target.name}: product-type translation unavailable; review candidate types carefully.`); }
                }
                if (this.ranker && eligible.length) {
                    // Ranking failure has no effect on deterministic discovery. Cap input and wait time.
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    try {
                        const evaluated = eligible.slice(0, 20).map(e => e.candidate);
                        const evaluatedIds = new Set(evaluated.map(c => String(c.mapping_id)));
                        const ids = await Promise.race([this.ranker(target, evaluated),
                            new Promise<string[]>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Ranking timed out')), 4500); })]);
                        const rank = new Map(ids.filter(id => evaluatedIds.has(String(id))).map((id, i) => [String(id), i]));
                        // Omitted evaluated IDs are incompatible; candidates beyond the input cap were never evaluated.
                        eligible = eligible.filter(e => rank.has(String(e.candidate.mapping_id)) || !evaluatedIds.has(String(e.candidate.mapping_id)));
                        eligible.sort((a, b) => (rank.get(String(a.candidate.mapping_id)) ?? 999) - (rank.get(String(b.candidate.mapping_id)) ?? 999));
                    }
                    catch { warnings.push(`${target.name}: AI ranking unavailable; candidates need manual semantic review.`); }
                    finally {
                        if (timer)
                            clearTimeout(timer);
                    }
                }
                for (const {candidate,quantity} of eligible.slice(0, 5)) {
                    const translatedName=translatedNames.get(String(candidate.mapping_id));
                    const payload = {
                        image_url: candidate.image_url,
                        translated_name: translatedName,
                        search_terms: target.aliases,
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
                            'Found using canonical, translated or previously approved local names; review product type before approval',
                            ...quantity.evidence,
                        ],
                        price: Number(candidate.price),
                        url: candidate.url,
                    };
                    previews.push({canonical_product_id:target.canonical_product_id,canonical_name:target.name,country_id:target.country_id,
                        supermarket_id:target.supermarket_id,product_id:candidate.product_id,mapping_id:candidate.mapping_id,product_name:candidate.name,payload});
                    if (dryRun || await this.repository.propose(target, candidate, payload))
                        proposed++;
                }
                if (!dryRun)
                    await this.repository.markChecked(original);
                nextCursor = `${original.canonical_product_id}:${original.supermarket_id}`;
            }
            const result = run ? await this.repository.finish(run.id, scanned, proposed) : {
                id:'preview',status:'completed' as const,scanned,proposed,dry_run:true,started_at,finished_at:new Date().toISOString(),error:null,
            };
            return {...result, next_cursor:options.country && hasMore ? nextCursor : null,has_more:!!options.country && hasMore,warnings:[...new Set(warnings)],previews};
        }
        catch (error) {
            if (run) await this.repository.finish(run.id, scanned, proposed, 'Mapping discovery failed; retry this batch.');
            throw error;
        }
    }
    async reviewBatch(ids: string[], action: 'approve' | 'reject', actor: string, reason?: string) {
        if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[1-9]\d*$/.test(id) || Number(id) > 2147483647)
            || new Set(ids).size !== ids.length || !['approve','reject'].includes(action)) throw new Error('Invalid batch review');
        const results: Array<{id: string;status?: string;error?: string}> = [];
        for (const id of ids) {
            try { results.push(await this.review(id,action,actor,reason)); }
            catch (error) { results.push({id,error:error instanceof MaintenanceConflictError || error instanceof MaintenanceNotFoundError ? error.message : 'Review failed; refresh and retry this item.'}); }
        }
        return {results};
    }
    review(id: string, action: 'approve' | 'reject' | 'undo', actor: string, reason?: string) {
        return this.repository.review(id, action, actor, reason, (candidate, target) => { this.validate(candidate, target); });
    }
}

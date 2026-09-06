import type { QueryResultRow } from 'pg';
import { query, getClient } from '../config/database';
import { Candidate, MaintenanceTarget, RunRow, Suggestion } from '../types/maintenance.types';
const coverageSql = `SELECT cp.id::text canonical_product_id,cp.name,cp.show_per_unit_price,c.id::text country_id,c.name country_name,
 s.id::text supermarket_id,s.name supermarket_name,count(pm.id)::int mapped_count,
 count(pm.id) FILTER (WHERE pm.availability_status='available' AND pm.duplicate_of_mapping_id IS NULL
 AND pm.last_checked_at >= now()-interval '7 days'
 AND pr.scraped_at>=now()-interval '7 days' AND pr.price>0
 AND pm.quantity_info IS NOT DISTINCT FROM pr.quantity_info
 AND (NOT cp.show_per_unit_price OR (pr.quantity_info->>'status'='verified'
   AND pr.quantity_info->>'contentUnit' IN ('kg','l')
   AND (pr.quantity_info->>'comparablePrice')::numeric > 0))
 AND (pol.expected_unit IS NULL OR pr.quantity_info->>'contentUnit'=pol.expected_unit)
 AND (cp.show_per_unit_price OR pol.expected_quantity IS NULL OR (pr.quantity_info->>'contentQuantity')::numeric=pol.expected_quantity))::int fresh_count,
 COALESCE(pol.aliases,'{}') || ARRAY(SELECT DISTINCT p2.name FROM products p2 JOIN product_mappings m2 ON m2.product_id=p2.id
 JOIN supermarkets s2 ON s2.id=m2.supermarket_id WHERE p2.canonical_product_id=cp.id AND s2.country_id=c.id LIMIT 20) aliases,
 pol.expected_unit,pol.expected_quantity,pol.excluded_terms
 FROM canonical_products cp CROSS JOIN supermarkets s JOIN countries c ON c.id=s.country_id
 LEFT JOIN products p ON p.canonical_product_id=cp.id LEFT JOIN product_mappings pm ON pm.product_id=p.id AND pm.supermarket_id=s.id
 LEFT JOIN LATERAL (SELECT price,scraped_at,quantity_info FROM prices WHERE product_mapping_id=pm.id
   ORDER BY scraped_at DESC,id DESC LIMIT 1) pr ON true
 LEFT JOIN product_maintenance_policies pol ON pol.canonical_product_id=cp.id
 WHERE NOT COALESCE(cp.disabled,false) AND s.is_active
 GROUP BY cp.id,c.id,s.id,pol.canonical_product_id`;
const candidateSql = `SELECT pm.id::text mapping_id,p.id::text product_id,
 CASE WHEN pm.raw_observation IS NOT NULL THEN pm.raw_observation->>'name' ELSE p.name END name,
 CASE WHEN pm.raw_observation IS NOT NULL THEN pm.raw_observation->>'description' ELSE p.description END description,
 CASE WHEN pm.raw_observation IS NOT NULL THEN pm.raw_observation->>'unit' ELSE p.unit END unit,
 CASE WHEN pm.raw_observation IS NOT NULL THEN (pm.raw_observation->>'unit_quantity')::numeric ELSE p.unit_quantity END unit_quantity,
 pm.raw_observation->>'price_basis' price_basis,
 pr.price,pr.currency,pr.quantity_info,pm.url,p.canonical_product_id::text,pm.availability_status,
 pm.last_checked_at,pm.last_available_at,pr.scraped_at
 FROM product_mappings pm JOIN products p ON p.id=pm.product_id
 JOIN LATERAL (SELECT price,currency,scraped_at,quantity_info FROM prices WHERE product_mapping_id=pm.id ORDER BY scraped_at DESC,id DESC LIMIT 1) pr ON true
 WHERE pm.duplicate_of_mapping_id IS NULL AND pm.quantity_info IS NOT DISTINCT FROM pr.quantity_info`;
export class ProductMaintenanceRepository {
    private async boundedRead<T extends QueryResultRow>(sql: string, params: unknown[]) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            await client.query("SET LOCAL statement_timeout = '3000ms'");
            const result = await client.query<T>(sql, params);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async targets(limit = 1000, gapsOnly = false): Promise<MaintenanceTarget[]> {
        const rows = (await this.boundedRead<MaintenanceTarget>(`WITH coverage AS (${coverageSql})
          SELECT coverage.* FROM coverage
          LEFT JOIN product_maintenance_checks mc ON mc.canonical_product_id=coverage.canonical_product_id::int
            AND mc.supermarket_id=coverage.supermarket_id::int
          WHERE NOT $2::boolean OR fresh_count=0
          ORDER BY mc.checked_at ASC NULLS FIRST,coverage.canonical_product_id::int,coverage.supermarket_id::int
          LIMIT $1`, [limit, gapsOnly])).rows;
        return rows.map(r => ({ ...r, status: r.fresh_count > 0 ? 'covered' : r.mapped_count > 0 ? 'stale' : 'missing' }));
    }
    async markChecked(target: MaintenanceTarget): Promise<void> { await query(`INSERT INTO product_maintenance_checks(canonical_product_id,supermarket_id) VALUES($1,$2) ON CONFLICT(canonical_product_id,supermarket_id) DO UPDATE SET checked_at=now()`, [target.canonical_product_id, target.supermarket_id]); }
    async candidates(target: MaintenanceTarget): Promise<Candidate[]> {
        // The seed set includes local mapped names, preserving multilingual search without translation guesses.
        const ignored = new Set(['kg', 'ml', 'gr', 'lt', 'cl', 'pcs', 'pack', 'pieces']);
        const seeds = [target.name, ...target.aliases].flatMap(x => x.toLocaleLowerCase().match(/[\p{L}]{2,}/gu) || []).filter(term => !ignored.has(term));
        if (!seeds.length)
            return [];
        return (await this.boundedRead<Candidate>(`${candidateSql} AND pm.supermarket_id=$1 AND p.canonical_product_id IS NULL
      AND pm.availability_status='available' AND pm.last_checked_at>=now()-interval '7 days'
      AND pr.scraped_at>=now()-interval '7 days' AND pr.price>0
      AND EXISTS (SELECT 1 FROM unnest($2::text[]) term WHERE position(term in lower(COALESCE(pm.raw_observation->>'name',p.name)))>0)
      ORDER BY (SELECT count(*) FROM unnest($2::text[]) term WHERE position(term in lower(COALESCE(pm.raw_observation->>'name',p.name)))>0) DESC,pr.scraped_at DESC,pm.id LIMIT 50`, [target.supermarket_id, [...new Set(seeds)].slice(0, 60)])).rows;
    }
    async propose(target: MaintenanceTarget, candidate: Candidate, payload: Suggestion['payload']): Promise<boolean> {
        const r = await query(`INSERT INTO product_maintenance_suggestions(canonical_product_id,mapping_id,product_id,country_id,supermarket_id,payload)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(canonical_product_id,mapping_id) DO UPDATE SET payload=EXCLUDED.payload
      WHERE product_maintenance_suggestions.status='pending'
      AND product_maintenance_suggestions.payload IS DISTINCT FROM EXCLUDED.payload RETURNING id`, [target.canonical_product_id, candidate.mapping_id, candidate.product_id, target.country_id, target.supermarket_id, JSON.stringify(payload)]);
        return r.rows.length > 0;
    }
    async suggestions(status = 'pending', country?: string): Promise<Suggestion[]> {
        return (await query<Suggestion>(`SELECT ms.*,cp.name canonical_name,p.name product_name,s.name supermarket_name
      FROM product_maintenance_suggestions ms JOIN canonical_products cp ON cp.id=ms.canonical_product_id
      JOIN products p ON p.id=ms.product_id JOIN supermarkets s ON s.id=ms.supermarket_id
      WHERE ms.status=$1 AND ($2::int IS NULL OR ms.country_id=$2) ORDER BY ms.id DESC LIMIT 200`, [status, country || null])).rows;
    }
    async runs(): Promise<RunRow[]> { return (await query<RunRow>('SELECT * FROM product_maintenance_runs ORDER BY id DESC LIMIT 10')).rows; }
    async start(dryRun: boolean): Promise<RunRow> { return (await query<RunRow>(`INSERT INTO product_maintenance_runs(status,dry_run) VALUES('running',$1) RETURNING *`, [dryRun])).rows[0]; }
    async finish(id: string, scanned: number, proposed: number, error?: string): Promise<RunRow> { return (await query<RunRow>(`UPDATE product_maintenance_runs SET status=$2,scanned=$3,proposed=$4,error=$5,finished_at=now() WHERE id=$1 RETURNING *`, [id, error ? 'failed' : 'completed', scanned, proposed, error || null])).rows[0]; }
    async review(id: string, action: 'approve' | 'reject' | 'undo', actor: string, reason: string | undefined, validate: (candidate: Candidate, target: MaintenanceTarget) => void): Promise<{
        id: string;
        status: string;
    }> {
        const db = await getClient();
        try {
            await db.query('BEGIN');
            const suggestion = (await db.query<Suggestion & {
                applied_product_updated_at: string;
            }>(`SELECT *,applied_product_updated_at::text FROM product_maintenance_suggestions WHERE id=$1 FOR UPDATE`, [id])).rows[0];
            if (!suggestion)
                throw new Error('Suggestion not found');
            const desired = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'undone';
            if (suggestion.status === desired) {
                await db.query('COMMIT');
                return { id, status: desired };
            }
            if ((action === 'undo' && suggestion.status !== 'approved') || (action !== 'undo' && suggestion.status !== 'pending'))
                throw new Error('Suggestion state conflict');
            const product = (await db.query<{
                canonical_product_id: string | null;
                updated_at: string;
            }>(`SELECT canonical_product_id::text,updated_at FROM products WHERE id=$1 FOR UPDATE`, [suggestion.product_id])).rows[0];
            const before = product.canonical_product_id;
            if (action === 'approve') {
                // Serialize against observation writes and re-read latest price only after the mapping lock.
                await db.query('SELECT id FROM product_mappings WHERE id=$1 FOR UPDATE', [suggestion.mapping_id]);
                const candidate = (await db.query<Candidate>(`${candidateSql} AND pm.id=$1`, [suggestion.mapping_id])).rows[0];
                await db.query('SELECT canonical_product_id FROM product_maintenance_policies WHERE canonical_product_id=$1 FOR SHARE', [suggestion.canonical_product_id]);
                const target = (await db.query<MaintenanceTarget>(`SELECT cp.id::text canonical_product_id,cp.name,cp.show_per_unit_price,pol.expected_unit,pol.expected_quantity,pol.excluded_terms
          FROM canonical_products cp LEFT JOIN product_maintenance_policies pol ON pol.canonical_product_id=cp.id
          WHERE cp.id=$1 AND NOT COALESCE(cp.disabled,false) FOR SHARE OF cp`, [suggestion.canonical_product_id])).rows[0];
                if (!candidate || !target || before !== null || String(candidate.product_id) !== String(suggestion.product_id))
                    throw new Error('Candidate classification conflict');
                if (!suggestion.payload.raw || suggestion.payload.raw.name !== candidate.name || suggestion.payload.raw.description !== candidate.description || suggestion.payload.raw.unit !== candidate.unit || String(suggestion.payload.raw.unit_quantity) !== String(candidate.unit_quantity) || (suggestion.payload.raw.price_basis || null) !== (candidate.price_basis || null))
                    throw new Error('Candidate details changed; manual review required');
                validate(candidate, target);
                const updated = (await db.query<{
                    updated_at: string;
                }>('UPDATE products SET canonical_product_id=$2,updated_at=clock_timestamp() WHERE id=$1 RETURNING updated_at::text', [suggestion.product_id, suggestion.canonical_product_id])).rows[0];
                await db.query('UPDATE product_maintenance_suggestions SET applied_product_updated_at=$2 WHERE id=$1', [id, updated.updated_at]);
            }
            else if (action === 'undo') {
                const changed = await db.query(`UPDATE products SET canonical_product_id=NULL,updated_at=clock_timestamp()
          WHERE id=$1 AND canonical_product_id=$2 AND updated_at=$3 RETURNING id`, [suggestion.product_id, suggestion.canonical_product_id, suggestion.applied_product_updated_at]);
                if (!changed.rows.length)
                    throw new Error('Product changed since approval; undo conflict');
            }
            await db.query('UPDATE product_maintenance_suggestions SET status=$2,reviewed_at=now() WHERE id=$1', [id, desired]);
            await db.query(`INSERT INTO product_maintenance_reviews(suggestion_id,action,actor,reason,before_canonical_id,after_canonical_id) VALUES($1,$2,$3,$4,$5,$6)`, [id, action, actor, reason || null, before, action === 'approve' ? suggestion.canonical_product_id : action === 'undo' ? null : before]);
            await db.query('COMMIT');
            return { id, status: desired };
        }
        catch (e) {
            await db.query('ROLLBACK');
            throw e;
        }
        finally {
            db.release();
        }
    }
}

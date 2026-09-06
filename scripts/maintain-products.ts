import 'dotenv/config';
import { ProductMaintenanceService } from '../src/services/ProductMaintenanceService';
import { closePool } from '../src/config/database';
async function main() {
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const country = args.find(a => a.startsWith('--country='))?.split('=')[1];
    let cursor = args.find(a => a.startsWith('--cursor='))?.split('=')[1];
    const limit = limitArg ? Number(limitArg.split('=')[1]) : 25;
    // Scheduled maintenance only creates proposals. Approval always needs an authenticated review.
    const dryRun = !args.includes('--apply') || args.includes('--dry-run');
    try {
        const service = new ProductMaintenanceService();
        if (args.includes('--all') && !country) throw new Error('--all requires --country=<id>');
        do {
            const result = await service.run(limit, dryRun, {country,cursor});
            console.log(JSON.stringify(result, null, 2));
            cursor = result.next_cursor || undefined;
        } while (args.includes('--all') && cursor);
    }
    finally {
        await closePool();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

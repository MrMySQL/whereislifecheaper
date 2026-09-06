import 'dotenv/config';
import { ProductMaintenanceService } from '../src/services/ProductMaintenanceService';
import { closePool } from '../src/config/database';
async function main() {
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const limit = limitArg ? Number(limitArg.split('=')[1]) : 25;
    // Scheduled maintenance only creates proposals. Approval always needs an authenticated review.
    const dryRun = !args.includes('--apply') || args.includes('--dry-run');
    try {
        console.log(JSON.stringify(await new ProductMaintenanceService().run(limit, dryRun), null, 2));
    }
    finally {
        await closePool();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

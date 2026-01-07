import cron from 'node-cron';
import { ScraperService } from '../services/ScraperService';
import { scraperLogger } from '../utils/logger';
import { closePool } from '../config/database';

/**
 * Scheduler for automated scraping jobs
 */
class ScraperScheduler {
  private scraperService: ScraperService;
  private dailyJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.scraperService = new ScraperService();
  }

  /**
   * Start the scheduler with daily scraping at specified time
   * Default: 3:00 AM
   */
  start(cronExpression: string = '0 3 * * *'): void {
    scraperLogger.info(`Starting scheduler with cron: ${cronExpression}`);

    this.dailyJob = cron.schedule(cronExpression, async () => {
      await this.runDailyScrape();
    });

    scraperLogger.info('Scheduler started successfully');
    console.log(`✅ Scheduler started. Daily scrape scheduled: ${cronExpression}`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.dailyJob) {
      this.dailyJob.stop();
      this.dailyJob = null;
      scraperLogger.info('Scheduler stopped');
      console.log('⏹️ Scheduler stopped');
    }
  }

  /**
   * Run daily scrape job
   */
  async runDailyScrape(): Promise<void> {
    if (this.isRunning) {
      scraperLogger.warn('Scraping already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    scraperLogger.info('Starting daily scrape job');
    console.log('\n🔄 Starting daily scrape...');

    try {
      const results = await this.scraperService.runAllScrapers();

      const totalProducts = results.reduce(
        (sum, r) => sum + r.productsScraped,
        0
      );
      const totalFailed = results.reduce(
        (sum, r) => sum + r.productsFailed,
        0
      );
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

      scraperLogger.info('Daily scrape completed', {
        supermarketsScraped: results.length,
        totalProducts,
        totalFailed,
        durationMinutes: duration,
      });

      console.log(`\n✅ Daily scrape completed:`);
      console.log(`   Supermarkets: ${results.length}`);
      console.log(`   Products: ${totalProducts}`);
      console.log(`   Failed: ${totalFailed}`);
      console.log(`   Duration: ${duration} minutes`);
    } catch (error) {
      scraperLogger.error('Daily scrape failed:', error);
      console.error('❌ Daily scrape failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Trigger manual scrape (for testing or on-demand)
   */
  async triggerManualScrape(supermarketId?: string): Promise<void> {
    if (this.isRunning) {
      throw new Error('Scraping already in progress');
    }

    if (supermarketId) {
      scraperLogger.info(`Manual scrape triggered for: ${supermarketId}`);
      await this.scraperService.runScraper(supermarketId);
    } else {
      await this.runDailyScrape();
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; nextRun: Date | null } {
    return {
      isRunning: this.isRunning,
      nextRun: this.dailyJob ? this.getNextRunDate() : null,
    };
  }

  /**
   * Calculate next run date from cron expression
   */
  private getNextRunDate(): Date | null {
    // This is a simplified calculation
    // In production, you might want to use a library like cron-parser
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0); // Default 3 AM

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }
}

// Create singleton instance
const scheduler = new ScraperScheduler();

// Main entry point when run directly
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--run-now')) {
    // Run scrape immediately
    console.log('Running scrape immediately...');
    await scheduler.triggerManualScrape();
    await closePool();
    process.exit(0);
  }

  // Start scheduler
  const cronExpression = process.env.SCRAPE_SCHEDULE || '0 3 * * *';
  scheduler.start(cronExpression);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down...');
    scheduler.stop();
    await closePool();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down...');
    scheduler.stop();
    await closePool();
    process.exit(0);
  });

  console.log('Press Ctrl+C to stop');
}

// Export for use in other modules
export { scheduler, ScraperScheduler };

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Scheduler failed:', error);
    process.exit(1);
  });
}

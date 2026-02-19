import { Router } from 'express';
import { ScraperService } from '../../services/ScraperService';
import { supermarketRepository, scrapeLogRepository } from '../../repositories';
import { scraperLogger } from '../../utils/logger';
import { isAdmin } from '../../auth';

const router = Router();
const scraperService = new ScraperService();

router.get('/categories/:supermarketId', async (req, res, next) => {
  try {
    const { supermarketId } = req.params;

    const supermarket = await supermarketRepository.findBasicById(supermarketId);
    if (!supermarket) {
      res.status(404).json({ error: 'Not Found', message: 'Supermarket not found' });
      return;
    }

    const categories = await scraperService.getAvailableCategories(supermarketId);
    res.json({ supermarket_id: supermarketId, supermarket_name: supermarket.name, categories });
  } catch (error) {
    next(error);
  }
});

router.post('/trigger', isAdmin, async (req, res, next) => {
  try {
    const { supermarket_id, categories } = req.body;
    scraperLogger.info('Manual scrape triggered via API', { supermarket_id, categories });

    if (supermarket_id) {
      const supermarket = await supermarketRepository.findActiveById(supermarket_id);
      if (!supermarket) {
        res.status(404).json({ error: 'Not Found', message: 'Supermarket not found or inactive' });
        return;
      }

      let categoryIds: string[] | undefined;
      if (categories && Array.isArray(categories) && categories.length > 0) {
        const availableCategories = await scraperService.getAvailableCategories(supermarket_id);
        const availableIds = availableCategories.map(c => c.id);
        const invalidCategories = categories.filter(c => !availableIds.includes(c));
        if (invalidCategories.length > 0) {
          res.status(400).json({
            error: 'Bad Request',
            message: `Invalid category IDs: ${invalidCategories.join(', ')}`,
            available_categories: availableCategories,
          });
          return;
        }
        categoryIds = categories;
      }

      scraperService.runScraper(supermarket_id, { categoryIds }).catch(err => {
        scraperLogger.error('Background scraper failed:', err);
      });

      res.json({
        message: 'Scraper triggered',
        supermarket_id,
        supermarket_name: supermarket.name,
        categories: categoryIds || 'all',
        status: 'running',
      });
    } else {
      scraperService.runAllScrapers().catch(err => {
        scraperLogger.error('Background scraper failed:', err);
      });
      res.json({ message: 'All scrapers triggered', status: 'running' });
    }
  } catch (error) {
    next(error);
  }
});

router.get('/status', isAdmin, async (_req, res, next) => {
  try {
    const [recentLogs, runningScrapers, stats] = await Promise.all([
      scrapeLogRepository.getRecentWithDetails(20),
      scrapeLogRepository.getRunning(),
      scrapeLogRepository.get24hSummary(),
    ]);

    res.json({
      status: runningScrapers.length > 0 ? 'running' : 'idle',
      running_scrapers: runningScrapers,
      recent_logs: recentLogs,
      stats_24h: stats,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/logs', isAdmin, async (req, res, next) => {
  try {
    const { supermarket_id, status, limit = '50', offset = '0' } = req.query;

    const data = await scrapeLogRepository.getLogs(
      {
        supermarketId: supermarket_id as string | undefined,
        status: status as string | undefined,
      },
      {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      }
    );

    res.json({
      data,
      count: data.length,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

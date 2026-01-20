/**
 * Script to update existing REWE products that have unit='pieces'
 * but contain weight information in their name.
 *
 * This fixes products like "Bio Äpfel 500g" that were scraped
 * with unit='pieces' instead of the correct unit from the name.
 *
 * Usage: npx ts-node scripts/update-rewe-product-units.ts [--dry-run]
 */

import { query, closePool } from '../src/database';
import { logger } from '../src/utils/logger';

interface ProductToUpdate {
  id: number;
  name: string;
  unit: string;
  unit_quantity: number;
}

/**
 * Parse weight from product name
 * German weight patterns: "500g", "1kg", "1,5kg", "250ml", "1l"
 */
function parseWeightFromName(name: string): { unit: string; unitQuantity: number } | null {
  if (!name) return null;

  const normalized = name.toLowerCase();

  // Pattern: number with optional decimal (comma or dot) + unit
  const weightPattern = /\b(\d+[,.]?\d*)\s*(kg|g|ml|l)\b/i;
  const match = normalized.match(weightPattern);

  if (match) {
    const quantity = parseFloat(match[1].replace(',', '.'));
    const unitType = match[2].toLowerCase();

    if (isNaN(quantity) || quantity <= 0) return null;

    return normalizeUnit(unitType, quantity);
  }

  return null;
}

/**
 * Normalize unit type and quantity (same logic as ReweScraper)
 */
function normalizeUnit(unitType: string, quantity: number): { unit: string; unitQuantity: number } {
  switch (unitType) {
    case 'kg':
      return { unit: 'kg', unitQuantity: quantity };
    case 'g':
      if (quantity >= 1000) {
        return { unit: 'kg', unitQuantity: quantity / 1000 };
      }
      return { unit: 'g', unitQuantity: quantity };
    case 'l':
    case 'liter':
      return { unit: 'l', unitQuantity: quantity };
    case 'ml':
      if (quantity >= 1000) {
        return { unit: 'l', unitQuantity: quantity / 1000 };
      }
      return { unit: 'ml', unitQuantity: quantity };
    default:
      return { unit: unitType, unitQuantity: quantity };
  }
}

async function updateReweProductUnits(dryRun: boolean = false): Promise<void> {
  logger.info(`Starting REWE product unit update${dryRun ? ' (DRY RUN)' : ''}...`);

  try {
    // Find all REWE products with unit='pieces'
    const result = await query<ProductToUpdate>(`
      SELECT DISTINCT p.id, p.name, p.unit, p.unit_quantity
      FROM products p
      INNER JOIN product_mappings pm ON pm.product_id = p.id
      INNER JOIN supermarkets s ON s.id = pm.supermarket_id
      WHERE s.name = 'REWE'
        AND p.unit = 'pieces'
      ORDER BY p.id
    `);

    const products = result.rows;
    logger.info(`Found ${products.length} REWE products with unit='pieces'`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      const weightFromName = parseWeightFromName(product.name);

      if (weightFromName) {
        logger.info(
          `${dryRun ? '[DRY RUN] Would update' : 'Updating'} product ${product.id}: "${product.name}" -> ${weightFromName.unitQuantity} ${weightFromName.unit}`
        );

        if (!dryRun) {
          await query(
            `UPDATE products SET unit = $1, unit_quantity = $2, updated_at = NOW() WHERE id = $3`,
            [weightFromName.unit, weightFromName.unitQuantity, product.id]
          );
        }

        updatedCount++;
      } else {
        skippedCount++;
        logger.debug(`Skipping product ${product.id}: "${product.name}" (no weight found in name)`);
      }
    }

    logger.info(`\n=== Summary ===`);
    logger.info(`Total products checked: ${products.length}`);
    logger.info(`Products ${dryRun ? 'that would be updated' : 'updated'}: ${updatedCount}`);
    logger.info(`Products skipped (no weight in name): ${skippedCount}`);

    if (dryRun && updatedCount > 0) {
      logger.info(`\nRun without --dry-run to apply these changes.`);
    }
  } catch (error) {
    logger.error('Failed to update products:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  try {
    await updateReweProductUnits(dryRun);
  } catch (error) {
    logger.error('Script failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();

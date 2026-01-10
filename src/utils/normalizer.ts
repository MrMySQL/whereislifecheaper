/**
 * Product name normalization utilities
 * Used for matching products across different supermarkets and countries
 */

export interface QuantityInfo {
  value: number;
  unit: string;
}

export interface BrandAndProduct {
  brand: string | null;
  product: string;
}

/**
 * Normalize product name for matching
 * Removes special characters, lowercases, and normalizes whitespace
 * Supports Latin, Cyrillic, and other Unicode letters
 * @param name - Original product name
 * @returns Normalized product name
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .replace(/[®™©]/g, '') // Remove trademark symbols
    .replace(/[^\p{L}\p{N}\s]/gu, '') // Remove special characters except letters, numbers, and spaces (Unicode-aware)
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extract quantity and unit from product name
 * Examples: "1.5L", "500g", "2kg", "6x330ml"
 * @param name - Product name or description
 * @returns Quantity information or null
 */
export function extractQuantity(name: string): QuantityInfo | null {
  if (!name) return null;

  // Patterns for common units
  const patterns = [
    // Liters: 1.5L, 1,5L, 1.5 L, 1.5l
    /(\d+[,.]?\d*)\s*(l|liter|litre|litro)s?/i,
    // Milliliters: 500ml, 500 ml
    /(\d+)\s*(ml|milliliter|millilitre)s?/i,
    // Kilograms: 2kg, 2 kg, 2,5kg
    /(\d+[,.]?\d*)\s*(kg|kilogram|kilo)s?/i,
    // Grams: 500g, 500 g
    /(\d+)\s*(g|gram|gr)s?(?!\s*r)/i, // Negative lookahead for 'gr' followed by 'r' (grams vs greater)
    // Pieces: 6x330ml, 12pcs, 6 pieces
    /(\d+)\s*(?:x|pcs|pieces|adet)/i,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      let unit = match[2].toLowerCase();

      // Normalize units
      if (unit.startsWith('l')) unit = 'l';
      else if (unit.startsWith('ml')) unit = 'ml';
      else if (unit.startsWith('kg') || unit === 'kilo') unit = 'kg';
      else if (unit === 'g' || unit === 'gr' || unit === 'gram') unit = 'g';
      else if (unit === 'pcs' || unit === 'pieces' || unit === 'adet') unit = 'pieces';

      return { value, unit };
    }
  }

  return null;
}

/**
 * Extract brand name from product name
 * Common brands should be added to this list
 * @param name - Product name
 * @returns Brand and remaining product name
 */
export function extractBrand(name: string): BrandAndProduct {
  if (!name) return { brand: null, product: name };

  // Common brands (expand this list based on actual data)
  const knownBrands = [
    'coca cola',
    'pepsi',
    'nestle',
    'unilever',
    'danone',
    'ferrero',
    'nutella',
    'milka',
    'pringles',
    'lays',
    'doritos',
    'colgate',
    'gillette',
    'dove',
    'nivea',
    'loreal',
    "l'oreal",
  ];

  const lowerName = name.toLowerCase();

  for (const brand of knownBrands) {
    if (lowerName.startsWith(brand)) {
      return {
        brand: brand,
        product: name.substring(brand.length).trim(),
      };
    }
  }

  // If no known brand found, try to extract first word as brand
  // This is a heuristic and may not always be accurate
  const words = name.split(' ');
  if (words.length > 1) {
    return {
      brand: words[0],
      product: words.slice(1).join(' '),
    };
  }

  return { brand: null, product: name };
}

/**
 * Calculate price per unit (per kg or per liter)
 * @param price - Product price
 * @param unitQuantity - Unit quantity value
 * @param unit - Unit type (kg, g, l, ml, etc.)
 * @returns Price per standard unit or undefined
 */
export function calculatePricePerUnit(
  price: number,
  unitQuantity?: number,
  unit?: string
): number | undefined {
  if (!unitQuantity || !unit || unitQuantity === 0) return undefined;

  let standardQuantity = unitQuantity;

  // Convert to standard units (kg or l)
  if (unit === 'g') {
    standardQuantity = unitQuantity / 1000; // Convert to kg
  } else if (unit === 'ml') {
    standardQuantity = unitQuantity / 1000; // Convert to l
  }

  return price / standardQuantity;
}

/**
 * Clean price string and convert to number
 * Handles various formats: "$1.99", "1,99 €", "1.999,99", "18,95 TL", etc.
 * @param priceString - Price as string
 * @returns Price as number or null
 */
export function parsePrice(priceString: string): number | null {
  if (!priceString) return null;

  // Remove currency symbols, currency codes, and extra spaces
  let cleaned = priceString
    .replace(/[€$£¥₺₽]/g, '')           // Currency symbols
    .replace(/\b(TL|TRY|EUR|USD|GBP|RUB|UZS)\b/gi, '')  // Currency codes
    .replace(/\s/g, '')
    .trim();

  // Handle European format (1.999,99) vs US format (1,999.99)
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // If both present, assume European format (comma is decimal)
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // Only comma, could be decimal or thousands separator
    // If comma is followed by 2 digits at the end, it's likely decimal
    if (/,\d{2}$/.test(cleaned)) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(',', '');
    }
  }

  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

/**
 * Generate a unique product key for matching
 * Combines normalized name, brand, and quantity
 * @param name - Product name
 * @param brand - Brand name
 * @param quantity - Quantity information
 * @returns Unique key for matching
 */
export function generateProductKey(
  name: string,
  brand: string | null,
  quantity: QuantityInfo | null
): string {
  const normalizedName = normalizeProductName(name);
  const brandPart = brand ? normalizeProductName(brand) : '';
  const quantityPart = quantity ? `${quantity.value}${quantity.unit}` : '';

  return `${brandPart}|${normalizedName}|${quantityPart}`.toLowerCase();
}

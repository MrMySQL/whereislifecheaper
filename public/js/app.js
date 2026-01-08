/**
 * Where Is Life Cheaper - Dashboard Application
 * Supports dynamic multi-country comparison
 */

// API base URL
const API_URL = '/api';

// Exchange rates to EUR (approximate)
// TODO: Fetch from an exchange rate API
const EXCHANGE_RATES_TO_EUR = {
  EUR: 1,
  TRY: 0.026,  // 1 TRY = 0.026 EUR (approx 38 TRY per EUR)
  UZS: 0.000076,  // 1 UZS = 0.000076 EUR
  USD: 0.92,
};

// Country flag emojis
const FLAGS = {
  TR: '\u{1F1F9}\u{1F1F7}',
  ME: '\u{1F1F2}\u{1F1EA}',
  ES: '\u{1F1EA}\u{1F1F8}',
  UZ: '\u{1F1FA}\u{1F1FF}',
};

// Country names
const COUNTRY_NAMES = {
  TR: 'Turkey',
  ME: 'Montenegro',
  ES: 'Spain',
  UZ: 'Uzbekistan',
};

// Currency symbols
const CURRENCY_SYMBOLS = {
  TRY: '\u{20BA}',
  EUR: '\u{20AC}',
  USD: '$',
  UZS: 'UZS',
};

// Currency by country
const COUNTRY_CURRENCIES = {
  TR: 'TRY',
  ME: 'EUR',
  ES: 'EUR',
  UZ: 'UZS',
};

// State
let comparisonData = [];
let countries = [];
let activeCountryCodes = [];

/**
 * Initialize the dashboard
 */
async function init() {
  console.log('Initializing dashboard...');

  // Load data
  await Promise.all([
    loadCountryStats(),
    loadComparison(),
  ]);

  // Setup event listeners
  setupEventListeners();

  // Update timestamp
  updateLastUpdated();

  // Update exchange rates display
  updateExchangeRatesDisplay();
}

/**
 * Load country statistics
 */
async function loadCountryStats() {
  const container = document.getElementById('country-cards');

  try {
    const response = await fetch(`${API_URL}/prices/stats`);
    const { data } = await response.json();

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No country data available yet. Run the scrapers first!</p>
        </div>
      `;
      return;
    }

    countries = data;
    // Track which countries have data
    activeCountryCodes = data.map(c => c.country_code);

    container.innerHTML = data.map(country => `
      <div class="country-card" data-flag="${FLAGS[country.country_code] || ''}">
        <h3>${FLAGS[country.country_code] || ''} ${country.country_name}</h3>
        <div class="stats">
          <div class="stat">
            <div class="stat-label">Products</div>
            <div class="stat-value">${country.product_count || 0}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Supermarkets</div>
            <div class="stat-value">${country.supermarket_count || 0}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Avg Price</div>
            <div class="stat-value">${formatPrice(country.avg_price, country.currency_code)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Last Update</div>
            <div class="stat-value">${formatDate(country.last_update)}</div>
          </div>
        </div>
      </div>
    `).join('');

    // Update footer with supermarket list
    const supermarketList = document.getElementById('supermarket-list');
    if (supermarketList) {
      const supermarkets = data.map(c => `${c.country_name}`).join(', ');
      supermarketList.textContent = supermarkets;
    }

  } catch (error) {
    console.error('Failed to load country stats:', error);
    container.innerHTML = `
      <div class="empty-state">
        <p>Failed to load country data. Is the API running?</p>
      </div>
    `;
  }
}

/**
 * Update exchange rates display
 */
function updateExchangeRatesDisplay() {
  const container = document.getElementById('exchange-rates');

  const rates = Object.entries(EXCHANGE_RATES_TO_EUR)
    .filter(([currency]) => currency !== 'EUR')
    .map(([currency, rate]) => `
      <div class="exchange-rate">
        <span class="currency">${currency}</span>
        <span class="rate">${(1/rate).toFixed(2)}</span>
        <span class="label">${currency} per EUR</span>
      </div>
    `).join('');

  container.innerHTML = rates || '<p>No exchange rate data available.</p>';
}

/**
 * Load comparison data using canonical products
 */
async function loadComparison() {
  const tbody = document.getElementById('comparison-tbody');
  const thead = document.getElementById('comparison-thead');

  try {
    const response = await fetch(`${API_URL}/canonical/comparison?limit=500`);
    const { data } = await response.json();

    if (!data || data.length === 0) {
      const colCount = 3 + activeCountryCodes.length;
      tbody.innerHTML = `
        <tr>
          <td colspan="${colCount}" class="empty-state">
            <p>No mapped products available for comparison.</p>
            <p><a href="/mapping.html">Map products to compare prices across countries</a></p>
          </td>
        </tr>
      `;
      return;
    }

    comparisonData = data;

    // Determine which countries are present in the comparison data
    const countriesInData = new Set();
    data.forEach(item => {
      Object.keys(item.prices_by_country).forEach(code => countriesInData.add(code));
    });

    // Use countries that have comparison data, maintain consistent order
    const orderedCountries = ['TR', 'ME', 'ES', 'UZ'].filter(code => countriesInData.has(code));

    // Update table headers
    updateTableHeaders(thead, orderedCountries);

    // Render the table
    renderComparisonTable(data, orderedCountries);

  } catch (error) {
    console.error('Failed to load comparison:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <p>Failed to load comparison data. Is the API running?</p>
        </td>
      </tr>
    `;
  }
}

/**
 * Update table headers based on available countries
 */
function updateTableHeaders(thead, countryCodes) {
  const countryHeaders = countryCodes.map(code =>
    `<th>${FLAGS[code] || ''} ${COUNTRY_NAMES[code] || code} (${COUNTRY_CURRENCIES[code] || 'EUR'})</th>`
  ).join('');

  thead.innerHTML = `
    <tr>
      <th>Product</th>
      <th>Unit</th>
      ${countryHeaders}
      <th>Cheapest</th>
    </tr>
  `;
}

/**
 * Render the comparison table
 */
function renderComparisonTable(data, countryCodes) {
  const tbody = document.getElementById('comparison-tbody');
  const searchTerm = document.getElementById('search-input').value.toLowerCase();

  // Filter by search term
  let filtered = data;
  if (searchTerm) {
    filtered = data.filter(item =>
      item.canonical_name.toLowerCase().includes(searchTerm)
    );
  }

  const colCount = 3 + countryCodes.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${colCount}" class="empty-state">
          <p>${searchTerm ? 'No matching products found.' : 'No products available for comparison.'}</p>
        </td>
      </tr>
    `;
    return;
  }

  // Render rows
  tbody.innerHTML = filtered.map(item => {
    // Get prices for each country
    const prices = countryCodes.map(code => ({
      code,
      data: item.prices_by_country[code],
    }));

    // Find unit from first available price
    const firstPrice = prices.find(p => p.data);
    const unitDisplay = firstPrice ? formatUnit(firstPrice.data.unit, firstPrice.data.unit_quantity) : '-';

    // Calculate EUR prices for comparison
    const eurPrices = prices
      .filter(p => p.data)
      .map(p => ({
        code: p.code,
        eurPrice: convertToEur(p.data.price, p.data.currency),
        originalPrice: p.data.price,
        currency: p.data.currency,
      }));

    // Find cheapest
    let cheapestInfo = '';
    if (eurPrices.length >= 2) {
      const sorted = [...eurPrices].sort((a, b) => a.eurPrice - b.eurPrice);
      const cheapest = sorted[0];
      const secondCheapest = sorted[1];

      if (cheapest.eurPrice > 0 && secondCheapest.eurPrice > 0) {
        const savings = ((secondCheapest.eurPrice - cheapest.eurPrice) / secondCheapest.eurPrice * 100).toFixed(0);
        cheapestInfo = `<span class="cheapest-badge">${FLAGS[cheapest.code] || ''} ${COUNTRY_NAMES[cheapest.code] || cheapest.code}</span>`;
        if (savings > 5) {
          cheapestInfo += `<br><small class="savings">${savings}% cheaper</small>`;
        }
      }
    }

    // Build price cells
    const priceCells = prices.map(p => {
      if (!p.data) {
        return `<td class="price"><span class="no-data">N/A</span></td>`;
      }

      const isLowest = eurPrices.length >= 2 &&
        convertToEur(p.data.price, p.data.currency) === Math.min(...eurPrices.map(ep => ep.eurPrice));

      return `
        <td class="price ${isLowest ? 'lowest-price' : ''}">
          ${formatPriceCell(p.data)}
          <br><small class="product-detail">${p.data.product_name}</small>
        </td>
      `;
    }).join('');

    return `
      <tr>
        <td class="product-name">
          <strong>${item.canonical_name}</strong>
          ${item.category ? `<br><small class="category">${item.category}</small>` : ''}
        </td>
        <td class="unit">${unitDisplay}</td>
        ${priceCells}
        <td class="cheapest">${cheapestInfo || '-'}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Convert price to EUR for comparison
 */
function convertToEur(price, currency) {
  const rate = EXCHANGE_RATES_TO_EUR[currency] || 1;
  return price * rate;
}

/**
 * Format a price cell with sale info
 */
function formatPriceCell(priceData) {
  if (priceData.is_on_sale && priceData.original_price) {
    return `
      <span class="sale-price">${formatPrice(priceData.price, priceData.currency)}</span>
      <span class="original-price">${formatPrice(priceData.original_price, priceData.currency)}</span>
    `;
  }
  return formatPrice(priceData.price, priceData.currency);
}

/**
 * Format price with currency
 */
function formatPrice(price, currency) {
  if (price === null || price === undefined) return '-';

  const num = parseFloat(price);
  if (isNaN(num)) return '-';

  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${num.toFixed(2)} ${symbol}`;
}

/**
 * Format unit and quantity
 */
function formatUnit(unit, quantity) {
  if (!unit) return '-';
  if (!quantity) return unit;
  return `${quantity} ${unit}`;
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Update last updated timestamp
 */
function updateLastUpdated() {
  const el = document.getElementById('last-updated');
  el.textContent = new Date().toLocaleString();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('search-input');
  let searchTimeout;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      // Re-determine countries from data
      const countriesInData = new Set();
      comparisonData.forEach(item => {
        Object.keys(item.prices_by_country).forEach(code => countriesInData.add(code));
      });
      const orderedCountries = ['TR', 'ME', 'ES', 'UZ'].filter(code => countriesInData.has(code));
      renderComparisonTable(comparisonData, orderedCountries);
    }, 300);
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-btn');
    btn.disabled = true;
    btn.textContent = 'Loading...';

    await Promise.all([
      loadCountryStats(),
      loadComparison(),
    ]);

    updateLastUpdated();
    btn.disabled = false;
    btn.textContent = 'Refresh Data';
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

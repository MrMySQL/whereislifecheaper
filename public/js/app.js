/**
 * Where Is Life Cheaper - Dashboard Application
 */

// API base URL
const API_URL = '/api';

// Exchange rate (hardcoded for now - TRY per EUR)
// TODO: Fetch from an exchange rate API
const EXCHANGE_RATE_TRY_EUR = 50.5;

// Country flag emojis
const FLAGS = {
  TR: '\u{1F1F9}\u{1F1F7}',
  ME: '\u{1F1F2}\u{1F1EA}',
  ES: '\u{1F1EA}\u{1F1F8}',
  UZ: '\u{1F1FA}\u{1F1FF}',
};

// Currency symbols
const CURRENCY_SYMBOLS = {
  TRY: '\u{20BA}',
  EUR: '\u{20AC}',
  USD: '$',
  UZS: 'UZS',
};

// State
let comparisonData = [];
let countries = [];

/**
 * Initialize the dashboard
 */
async function init() {
  console.log('Initializing dashboard...');

  // Set exchange rate display
  document.getElementById('try-rate').textContent = EXCHANGE_RATE_TRY_EUR.toFixed(2);

  // Load data
  await Promise.all([
    loadCountryStats(),
    loadComparison(),
  ]);

  // Setup event listeners
  setupEventListeners();

  // Update timestamp
  updateLastUpdated();
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
 * Load comparison data using canonical products
 */
async function loadComparison() {
  const tbody = document.getElementById('comparison-tbody');

  try {
    const response = await fetch(`${API_URL}/canonical/comparison?limit=500`);
    const { data } = await response.json();

    if (!data || data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">
            <p>No mapped products available for comparison.</p>
            <p><a href="/mapping.html">Map products to compare prices across countries</a></p>
          </td>
        </tr>
      `;
      return;
    }

    comparisonData = data;
    renderComparisonTable(data);

  } catch (error) {
    console.error('Failed to load comparison:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <p>Failed to load comparison data. Is the API running?</p>
        </td>
      </tr>
    `;
  }
}

/**
 * Render the comparison table
 */
function renderComparisonTable(data) {
  const tbody = document.getElementById('comparison-tbody');
  const searchTerm = document.getElementById('search-input').value.toLowerCase();

  // Filter by search term
  let filtered = data;
  if (searchTerm) {
    filtered = data.filter(item =>
      item.canonical_name.toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <p>${searchTerm ? 'No matching products found.' : 'No products available for comparison.'}</p>
        </td>
      </tr>
    `;
    return;
  }

  // Render rows
  tbody.innerHTML = filtered.map(item => {
    const trPrice = item.prices_by_country['TR'];
    const mePrice = item.prices_by_country['ME'];

    // Calculate difference in EUR for comparison
    let difference = '';
    let diffClass = '';

    if (trPrice && mePrice) {
      const trPriceEur = trPrice.price / EXCHANGE_RATE_TRY_EUR;
      const diff = ((trPriceEur - mePrice.price) / mePrice.price * 100).toFixed(1);

      if (Math.abs(diff) < 5) {
        difference = 'Similar';
        diffClass = 'similar';
      } else if (trPriceEur < mePrice.price) {
        difference = `TR ${Math.abs(diff)}% cheaper`;
        diffClass = 'cheaper';
      } else {
        difference = `ME ${Math.abs(diff)}% cheaper`;
        diffClass = 'expensive';
      }
    }

    return `
      <tr>
        <td class="product-name">
          <strong>${item.canonical_name}</strong>
          ${item.category ? `<br><small style="color: var(--text-muted)">${item.category}</small>` : ''}
        </td>
        <td>
          ${trPrice ? formatUnit(trPrice.unit, trPrice.unit_quantity) : (mePrice ? formatUnit(mePrice.unit, mePrice.unit_quantity) : '-')}
        </td>
        <td class="price">
          ${trPrice ? formatPriceCell(trPrice) : '<span style="color: var(--text-muted)">N/A</span>'}
          ${trPrice ? `<br><small style="color: var(--text-muted)">${trPrice.product_name}</small>` : ''}
        </td>
        <td class="price">
          ${mePrice ? formatPriceCell(mePrice) : '<span style="color: var(--text-muted)">N/A</span>'}
          ${mePrice ? `<br><small style="color: var(--text-muted)">${mePrice.product_name}</small>` : ''}
        </td>
        <td>
          ${difference ? `<span class="difference ${diffClass}">${difference}</span>` : '-'}
        </td>
      </tr>
    `;
  }).join('');
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
      renderComparisonTable(comparisonData);
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

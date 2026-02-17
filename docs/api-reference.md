# API Reference

This document provides complete documentation for the WhereIsLifeCheaper REST API.

## Base URL

- **Local Development**: `http://localhost:3000/api`
- **Production**: `https://your-domain.vercel.app/api`

## API Endpoints Overview

| Category | Endpoints |
|----------|-----------|
| Authentication | `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/me`, `/api/auth/logout` |
| Countries | `/api/countries`, `/api/countries/:id` |
| Supermarkets | `/api/supermarkets` |
| Products | `/api/products`, `/api/products/:id` |
| Prices | `/api/prices/latest`, `/api/prices/stats` |
| Canonical | `/api/canonical`, `/api/canonical/:id`, `/api/canonical/comparison` |
| Scraper | `/api/scraper/categories/:id`, `/api/scraper/trigger`, `/api/scraper/logs` |
| Exchange Rates | `/api/rates`, `/api/rates/sync` |
| Health | `/health` |

## Authentication

The API uses Google OAuth 2.0 for authentication. Some endpoints require authentication or admin privileges.

### Authentication Flow

1. Redirect user to `/api/auth/google`
2. User authenticates with Google
3. Callback to `/api/auth/google/callback`
4. Session cookie set automatically
5. Use session cookie for authenticated requests

### Authentication Endpoints

#### GET /api/auth/google

Initiates Google OAuth flow.

**Response**: Redirects to Google consent screen

---

#### GET /api/auth/google/callback

OAuth callback handler.

**Response**: Redirects to frontend with session established

---

#### GET /api/auth/logout

Logs out current user.

**Response**: Redirects to frontend

---

#### GET /api/auth/me

Returns current authenticated user.

**Response**:
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "avatar_url": "https://...",
    "is_admin": false
  }
}
```

**Response (not authenticated)**:
```json
{
  "user": null
}
```

---

## Countries

### GET /api/countries

Returns all countries with their supermarkets.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Turkey",
      "code": "TR",
      "currency_code": "TRY",
      "flag_emoji": "🇹🇷",
      "supermarkets": [
        {
          "id": 1,
          "name": "Migros",
          "base_url": "https://www.migros.com.tr",
          "logo_url": "...",
          "is_active": true
        }
      ]
    }
  ]
}
```

---

### GET /api/countries/:id

Returns a single country with supermarkets.

**Parameters**:
- `id` (path) - Country ID

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Turkey",
    "code": "TR",
    "currency_code": "TRY",
    "flag_emoji": "🇹🇷",
    "supermarkets": [...]
  }
}
```

---

## Supermarkets

### GET /api/supermarkets

Returns supermarkets with optional filtering.

**Query Parameters**:
- `country_id` (optional) - Filter by country
- `is_active` (optional) - Filter by active status

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Migros",
      "country_id": 1,
      "base_url": "https://www.migros.com.tr",
      "is_active": true,
      "country": {
        "name": "Turkey",
        "code": "TR"
      }
    }
  ]
}
```

---

## Products

### GET /api/products

Search and list products with pagination.

**Query Parameters**:
- `search` (optional) - Search term for product name
- `category_id` (optional) - Filter by category
- `brand` (optional) - Filter by brand
- `limit` (optional, default: 50) - Results per page
- `offset` (optional, default: 0) - Pagination offset

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Organic Whole Milk",
      "normalized_name": "organic whole milk",
      "brand": "Brand Name",
      "unit": "L",
      "unit_quantity": 1.0,
      "image_url": "...",
      "category": {
        "id": 5,
        "name": "Dairy"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### GET /api/products/:id

Returns a single product with mappings and latest prices.

**Parameters**:
- `id` (path) - Product ID

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Organic Whole Milk",
    "brand": "Brand Name",
    "unit": "L",
    "unit_quantity": 1.0,
    "category": {
      "id": 5,
      "name": "Dairy"
    },
    "mappings": [
      {
        "id": 1,
        "supermarket": {
          "id": 1,
          "name": "Migros",
          "country": {
            "name": "Turkey",
            "code": "TR"
          }
        },
        "external_id": "123456",
        "url": "https://...",
        "latest_price": {
          "price": 45.90,
          "currency": "TRY",
          "is_on_sale": false,
          "scraped_at": "2024-01-15T10:00:00Z"
        }
      }
    ]
  }
}
```

---

## Prices

### GET /api/prices/latest

Returns latest prices across all products and supermarkets.

**Query Parameters**:
- `country_id` (optional) - Filter by country
- `supermarket_id` (optional) - Filter by supermarket
- `limit` (optional, default: 100) - Results limit

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "product_id": 1,
      "product_name": "Organic Whole Milk",
      "brand": "Brand Name",
      "supermarket_id": 1,
      "supermarket_name": "Migros",
      "country_code": "TR",
      "price": 45.90,
      "currency": "TRY",
      "original_price": null,
      "is_on_sale": false,
      "price_per_unit": 45.90,
      "scraped_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

### GET /api/prices/stats

Returns country-level catalog coverage statistics.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "country_id": 1,
      "country_name": "Turkey",
      "country_code": "TR",
      "currency_code": "TRY",
      "flag_emoji": "🇹🇷",
      "product_count": 1500,
      "supermarket_count": 3,
      "last_scrape": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

## Canonical Products

Canonical products are user-defined identifiers (like "Milk 1L") that group similar products across countries for comparison.

### GET /api/canonical

List canonical products with search and counts.

**Query Parameters**:
- `search` (optional) - Search by name
- `limit` (optional, default: 50) - Results limit
- `offset` (optional, default: 0) - Pagination offset

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Milk 1L",
      "description": "1 liter of whole milk",
      "show_per_unit_price": false,
      "disabled": false,
      "linked_products_count": 12,
      "countries_count": 4
    }
  ]
}
```

---

### GET /api/canonical/:id

Get a canonical product with all linked products and prices.

**Parameters**:
- `id` (path) - Canonical product ID

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Milk 1L",
    "description": "1 liter of whole milk",
    "show_per_unit_price": false,
    "disabled": false,
    "products": [
      {
        "id": 1,
        "name": "Organic Whole Milk 1L",
        "brand": "Brand",
        "supermarket": {
          "id": 1,
          "name": "Migros",
          "country": {
            "name": "Turkey",
            "code": "TR",
            "flag_emoji": "🇹🇷"
          }
        },
        "latest_price": {
          "price": 45.90,
          "currency": "TRY",
          "scraped_at": "2024-01-15T10:00:00Z"
        }
      }
    ]
  }
}
```

---

### POST /api/canonical

Create a new canonical product.

**Authentication**: Admin required

**Request Body**:
```json
{
  "name": "Bread 500g",
  "description": "Standard white bread loaf",
  "show_per_unit_price": false
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Bread 500g",
    "description": "Standard white bread loaf",
    "show_per_unit_price": false,
    "disabled": false
  }
}
```

---

### PUT /api/canonical/:id

Update a canonical product.

**Authentication**: Admin required

**Parameters**:
- `id` (path) - Canonical product ID

**Request Body**:
```json
{
  "name": "Bread 500g",
  "description": "Updated description",
  "show_per_unit_price": true,
  "disabled": false
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Bread 500g",
    "description": "Updated description",
    "show_per_unit_price": true,
    "disabled": false
  }
}
```

---

### DELETE /api/canonical/:id

Delete a canonical product.

**Authentication**: Admin required

**Parameters**:
- `id` (path) - Canonical product ID

**Response**:
```json
{
  "success": true,
  "message": "Canonical product deleted"
}
```

---

### PUT /api/canonical/link

Link or unlink a product to/from a canonical product.

**Authentication**: Admin required

**Request Body**:
```json
{
  "product_id": 1,
  "canonical_product_id": 2
}
```

To unlink, pass `null` for `canonical_product_id`:
```json
{
  "product_id": 1,
  "canonical_product_id": null
}
```

**Response**:
```json
{
  "message": "Product linked",
  "data": {
    "id": 1,
    "name": "Organic Milk 1L",
    "canonical_product_id": 2
  }
}
```

---

### PATCH /api/canonical/:id

Update a canonical product's settings.

**Authentication**: Admin required

**Parameters**:
- `id` (path) - Canonical product ID

**Request Body**:
```json
{
  "show_per_unit_price": true,
  "disabled": false
}
```

**Response**:
```json
{
  "message": "Updated successfully",
  "data": {
    "id": 2,
    "name": "Milk 1L",
    "show_per_unit_price": true,
    "disabled": false
  }
}
```

---

### GET /api/canonical/comparison

Get cross-country price comparison for all canonical products.

**Query Parameters**:
- `search` (optional) - Filter by canonical product name
- `limit` (optional, default: 100) - Results per page
- `offset` (optional, default: 0) - Pagination offset

**Response**:
```json
{
  "data": [
    {
      "canonical_id": 1,
      "canonical_name": "Milk 1L",
      "canonical_description": "1 liter of whole milk",
      "show_per_unit_price": false,
      "category": "Dairy",
      "country_count": 4,
      "prices_by_country": {
        "TR": {
          "product_id": 1,
          "product_name": "Süt 1L",
          "price": 45.90,
          "currency": "TRY",
          "supermarket": "Migros",
          "country_name": "Turkey",
          "product_count": 2,
          "products": [...]
        },
        "DE": {
          "product_id": 2,
          "product_name": "Vollmilch 1L",
          "price": 1.29,
          "currency": "EUR",
          "supermarket": "REWE",
          "country_name": "Germany",
          "product_count": 1,
          "products": [...]
        }
      }
    }
  ],
  "total": 50,
  "pagination": {
    "limit": 100,
    "offset": 0
  }
}
```

---

### GET /api/canonical/products-by-country/:countryId

Get all products for a country with their canonical product assignments.

**Parameters**:
- `countryId` (path) - Country ID

**Query Parameters**:
- `search` (optional) - Search by product name or brand
- `supermarket_id` (optional) - Filter by supermarket
- `mapped_only` (optional) - Set to "true" to show only products with canonical mappings
- `limit` (optional, default: 100) - Results per page
- `offset` (optional, default: 0) - Pagination offset

**Response**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "Organic Milk 1L",
      "brand": "Brand",
      "canonical_product_id": 2,
      "canonical_product_name": "Milk 1L",
      "supermarket_name": "Migros",
      "price": 45.90,
      "currency": "TRY"
    }
  ],
  "count": 150,
  "pagination": {
    "limit": 100,
    "offset": 0
  }
}
```

---

### GET /api/canonical/:id/products

Get all products linked to a specific canonical product.

**Parameters**:
- `id` (path) - Canonical product ID

**Response**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "Organic Milk 1L",
      "brand": "Brand",
      "supermarket_name": "Migros",
      "country_name": "Turkey",
      "country_code": "TR",
      "price": 45.90,
      "currency": "TRY",
      "scraped_at": "2024-01-15T10:00:00Z"
    }
  ],
  "count": 12
}
```

---

## Scraper

### GET /api/scraper/categories/:supermarketId

Get available scraper categories for a supermarket.

**Parameters**:
- `supermarketId` (path) - Supermarket ID

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "fruits-vegetables",
      "name": "Fruits & Vegetables",
      "url": "https://..."
    },
    {
      "id": "dairy",
      "name": "Dairy Products",
      "url": "https://..."
    }
  ]
}
```

---

### POST /api/scraper/trigger

Manually trigger a scraper execution.

**Authentication**: Admin required

**Request Body**:
```json
{
  "supermarket_id": 1,
  "categories": ["fruits-vegetables", "dairy"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Scraper triggered",
  "log_id": 123
}
```

---

### GET /api/scraper/logs

Get scraper execution history.

**Query Parameters**:
- `limit` (optional, default: 50) - Results limit
- `status` (optional) - Filter by status (running, success, failed, partial)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "supermarket": {
        "id": 1,
        "name": "Migros"
      },
      "status": "success",
      "started_at": "2024-01-15T10:00:00Z",
      "completed_at": "2024-01-15T10:15:00Z",
      "products_scraped": 500,
      "products_failed": 5,
      "error_message": null,
      "duration_seconds": 900
    }
  ]
}
```

---

### GET /api/scraper/logs/:supermarketId

Get scraper logs for a specific supermarket.

**Parameters**:
- `supermarketId` (path) - Supermarket ID

**Query Parameters**:
- `limit` (optional, default: 10) - Results limit

**Response**: Same format as `/api/scraper/logs`

---

## Exchange Rates

### GET /api/rates

Get current exchange rates.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "base_currency": "EUR",
      "target_currency": "TRY",
      "rate": 32.50,
      "fetched_at": "2024-01-15T00:00:00Z"
    },
    {
      "base_currency": "EUR",
      "target_currency": "UZS",
      "rate": 13500.00,
      "fetched_at": "2024-01-15T00:00:00Z"
    }
  ]
}
```

---

### POST /api/rates/sync

Synchronize exchange rates from external API.

**Authentication**: Admin required

**Response**:
```json
{
  "success": true,
  "message": "Exchange rates synchronized",
  "rates_updated": 5
}
```

---

## Health Check

### GET /health

Check API health status.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "database": "connected",
  "version": "1.0.0"
}
```

---

## Error Responses

All endpoints return consistent error responses:

### 400 Bad Request
```json
{
  "success": false,
  "error": "Invalid request parameters",
  "details": {
    "field": "limit",
    "message": "must be a positive integer"
  }
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Admin privileges required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limiting

Currently, there is no rate limiting implemented. Future versions may add:
- Request rate limits per IP
- Authentication-based quotas
- Scraper trigger cooldowns

---

## CORS

The API supports CORS with the following configuration:
- **Development**: All origins allowed
- **Production**: Configured allowed origins

---

## Pagination

Paginated endpoints use a consistent format:

**Request**:
```
GET /api/products?limit=50&offset=100
```

**Response**:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 500,
    "limit": 50,
    "offset": 100,
    "hasMore": true
  }
}
```

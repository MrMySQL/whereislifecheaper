# Frontend Documentation

This document covers the React frontend application for WhereIsLifeCheaper.

## Overview

The frontend is a Single-Page Application (SPA) built with:
- **React 19.2** - UI framework
- **Vite 7.2** - Build tool and dev server
- **TailwindCSS 3.4** - Utility-first CSS
- **React Router v7.12** - Client-side routing
- **TanStack Query 5.90** - Server state management
- **Recharts 3.6** - Data visualization
- **Lucide React 0.562** - Icon library
- **Axios 1.13** - HTTP client
- **i18next 25.7** - Internationalization
- **react-i18next 16.5** - React bindings for i18next

## Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable components
│   │   ├── common/          # Generic components
│   │   │   ├── Loading.tsx
│   │   │   ├── LanguageSwitcher.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   ├── comparison/      # Price comparison
│   │   │   ├── ComparisonTable.tsx
│   │   │   ├── CountryCard.tsx
│   │   │   ├── CountrySelector.tsx
│   │   │   ├── CurrencyRatesTable.tsx
│   │   │   └── PriceHistoryChart.tsx
│   │   └── layout/          # Layout components
│   │       ├── Header.tsx
│   │       └── Layout.tsx
│   ├── context/             # React context providers
│   │   └── AuthContext.tsx
│   ├── i18n/                # Internationalization
│   │   ├── index.ts         # i18next configuration
│   │   ├── i18next.d.ts     # Type definitions
│   │   └── locales/         # Translation files (EN, TR, etc.)
│   ├── pages/               # Page components
│   │   ├── Home.tsx
│   │   ├── CountryProducts.tsx
│   │   ├── Login.tsx
│   │   └── admin/
│   │       ├── Mapping.tsx
│   │       └── Scrapers.tsx
│   ├── services/            # API client
│   │   └── api.ts
│   ├── types/               # TypeScript interfaces
│   │   └── index.ts
│   ├── utils/               # Helper functions
│   │   ├── currency.ts
│   │   └── dateFormat.ts
│   ├── App.tsx              # Root component
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── index.html               # HTML template
├── package.json
├── tailwind.config.js
├── tsconfig.app.json        # App TypeScript config
├── tsconfig.node.json       # Build tool TypeScript config
└── vite.config.ts
```

## Getting Started

### Development

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:5173

### Production Build

```bash
npm run build
```

Output goes to `dist/` directory.

## Routing

Routes are defined in `App.tsx`:

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `Home` | Price comparison table |
| `/login` | `Login` | Google OAuth login |
| `/country/:code` | `CountryProducts` | Products for a country |
| `/admin/mapping` | `Mapping` | Canonical product management |
| `/admin/scrapers` | `Scrapers` | Manual scraper triggering |

### Protected Routes

Admin routes require authentication and admin privileges:

```tsx
<Route
  path="/admin/mapping"
  element={
    <ProtectedRoute requireAdmin>
      <Mapping />
    </ProtectedRoute>
  }
/>
```

## State Management

### Authentication Context

`AuthContext` provides user state throughout the app:

```tsx
import { useAuth } from '../context/AuthContext';

function Component() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <div>Welcome, {user.name}</div>;
}
```

### Server State (TanStack Query)

For API data fetching and caching:

```tsx
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

function Countries() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/countries').then(r => r.data.data),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <ul>
      {data.map(country => (
        <li key={country.id}>{country.name}</li>
      ))}
    </ul>
  );
}
```

## Components

### Layout Components

#### Header

Navigation bar with user info and logout:

```tsx
<Header />
```

Features:
- Logo and title
- Navigation links
- User avatar (when logged in)
- Login/Logout button

#### Layout

Wrapper with header and content outlet:

```tsx
<Layout>
  <Outlet />
</Layout>
```

### Comparison Components

#### ComparisonTable

Main price comparison matrix:

```tsx
<ComparisonTable
  countries={selectedCountries}
  canonicalProducts={products}
  exchangeRates={rates}
  baseCurrency="EUR"
/>
```

Props:
- `countries` - Selected countries to compare
- `canonicalProducts` - Products with prices
- `exchangeRates` - Currency conversion rates
- `baseCurrency` - Display currency

Features:
- Price comparison across countries
- Currency conversion
- Product linking status
- Expandable product details

#### CountrySelector

Multi-select for choosing countries:

```tsx
<CountrySelector
  countries={allCountries}
  selected={selectedCodes}
  onChange={setSelectedCodes}
/>
```

#### CountryCard

Summary card for a single country:

```tsx
<CountryCard
  country={country}
  productCount={150}
  avgPrice={125.50}
  lastScraped="2024-01-15T10:00:00Z"
/>
```

#### PriceHistoryChart

Line chart showing price trends:

```tsx
<PriceHistoryChart
  productId={123}
  countryCode="TR"
/>
```

Uses Recharts for visualization.

#### CurrencyRatesTable

Display exchange rates:

```tsx
<CurrencyRatesTable
  rates={exchangeRates}
  baseCurrency="EUR"
/>
```

### Common Components

#### Loading

Spinner component:

```tsx
<Loading />
<Loading size="sm" />
<Loading fullScreen />
```

#### ProtectedRoute

Route guard for authentication:

```tsx
<ProtectedRoute>
  <Component />
</ProtectedRoute>

<ProtectedRoute requireAdmin>
  <AdminComponent />
</ProtectedRoute>
```

## Pages

### Home

Main comparison page (`/`):

- Country selector
- Canonical products table
- Price comparison matrix
- Currency conversion

```tsx
// Home.tsx
function Home() {
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);

  const { data: canonicalProducts } = useQuery({
    queryKey: ['canonical', selectedCountries],
    queryFn: () => fetchCanonicalProducts(selectedCountries),
  });

  return (
    <div>
      <CountrySelector
        selected={selectedCountries}
        onChange={setSelectedCountries}
      />
      <ComparisonTable
        countries={selectedCountries}
        products={canonicalProducts}
      />
    </div>
  );
}
```

### CountryProducts

Products for a specific country (`/country/:code`):

- Product list with filters
- Search by name
- Category filter
- Price display

### Login

OAuth login page (`/login`):

- Google OAuth button
- Redirect handling

### Admin: Mapping

Canonical product management (`/admin/mapping`):

- Create canonical products
- Search and link products
- View linked products per canonical
- Enable/disable canonical products

### Admin: Scrapers

Scraper management (`/admin/scrapers`):

- List supermarkets with scraper status
- Manual scraper triggering
- View scrape logs
- Category selection for partial scrapes

## API Client

Centralized API client in `services/api.ts`:

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // Include cookies for auth
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

Usage:

```typescript
// GET request
const response = await api.get('/countries');
const countries = response.data.data;

// POST request
await api.post('/canonical', { name: 'Milk 1L' });

// With query params
const products = await api.get('/products', {
  params: { search: 'milk', limit: 50 }
});
```

## Currency Utilities

`utils/currency.ts` provides currency conversion:

```typescript
import { fetchExchangeRates, convertPrice } from '../utils/currency';

// Fetch rates from API
const rates = await fetchExchangeRates();

// Convert price
const eurPrice = convertPrice(100, 'TRY', 'EUR', rates);
```

## Internationalization (i18n)

The app uses i18next for multi-language support:

### Configuration

```typescript
// i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      tr: { translation: trTranslations },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
```

### Using Translations

```tsx
import { useTranslation } from 'react-i18next';

function Component() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('home.title')}</h1>
      <p>{t('home.description')}</p>
    </div>
  );
}
```

### Language Switcher

```tsx
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';

// In Header or Layout
<LanguageSwitcher />
```

### Adding New Translations

1. Create translation file in `i18n/locales/`:
   ```typescript
   // i18n/locales/de.ts
   export default {
     home: {
       title: 'Preisvergleich',
       description: 'Vergleichen Sie Lebensmittelpreise...'
     }
   };
   ```

2. Add to i18n config:
   ```typescript
   import deTranslations from './locales/de';

   resources: {
     en: { translation: enTranslations },
     tr: { translation: trTranslations },
     de: { translation: deTranslations },
   }
   ```

## Styling

### Tailwind CSS

Utility classes for styling:

```tsx
<div className="bg-white rounded-lg shadow-md p-6">
  <h2 className="text-xl font-semibold text-gray-900">Title</h2>
  <p className="text-gray-600 mt-2">Description</p>
  <button className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
    Action
  </button>
</div>
```

### Custom Classes

Global styles in `index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn-primary {
    @apply bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition;
  }

  .card {
    @apply bg-white rounded-lg shadow-md p-6;
  }
}
```

### Responsive Design

Mobile-first approach:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>
```

## Environment Variables

Create `.env.local` for local development:

```bash
# API URL (defaults to /api for same-origin)
VITE_API_URL=http://localhost:3000/api
```

Access in code:

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

## Build Configuration

### Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

### TypeScript Config

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

## Adding New Features

### New Page

1. Create component in `pages/`:
   ```tsx
   // pages/NewPage.tsx
   export function NewPage() {
     return <div>New Page</div>;
   }
   ```

2. Add route in `App.tsx`:
   ```tsx
   <Route path="/new-page" element={<NewPage />} />
   ```

### New Component

1. Create component file:
   ```tsx
   // components/NewComponent.tsx
   interface NewComponentProps {
     title: string;
     onAction?: () => void;
   }

   export function NewComponent({ title, onAction }: NewComponentProps) {
     return (
       <div className="card">
         <h3>{title}</h3>
         {onAction && <button onClick={onAction}>Action</button>}
       </div>
     );
   }
   ```

2. Export from index if using barrel exports

### New API Hook

```tsx
// hooks/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export function useProducts(categoryId?: number) {
  return useQuery({
    queryKey: ['products', categoryId],
    queryFn: () => api.get('/products', { params: { category_id: categoryId } })
      .then(r => r.data.data),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductInput) =>
      api.post('/products', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
```

## Testing

### Component Testing

```tsx
// __tests__/CountryCard.test.tsx
import { render, screen } from '@testing-library/react';
import { CountryCard } from '../components/CountryCard';

describe('CountryCard', () => {
  it('renders country name', () => {
    render(
      <CountryCard
        country={{ id: 1, name: 'Turkey', code: 'TR', flag_emoji: '🇹🇷' }}
      />
    );

    expect(screen.getByText('Turkey')).toBeInTheDocument();
  });
});
```

### Running Tests

```bash
npm test
npm test -- --coverage
```

## Performance

### Code Splitting

React Router handles route-based splitting:

```tsx
const AdminMapping = lazy(() => import('./pages/admin/Mapping'));

<Route
  path="/admin/mapping"
  element={
    <Suspense fallback={<Loading />}>
      <AdminMapping />
    </Suspense>
  }
/>
```

### Query Caching

TanStack Query caches responses:

```tsx
const { data } = useQuery({
  queryKey: ['countries'],
  queryFn: fetchCountries,
  staleTime: 5 * 60 * 1000,  // 5 minutes
  cacheTime: 30 * 60 * 1000, // 30 minutes
});
```

### Memoization

Prevent unnecessary re-renders:

```tsx
const MemoizedComponent = React.memo(function Component({ data }) {
  return <div>{/* ... */}</div>;
});

// Or with useMemo
const processedData = useMemo(() =>
  expensiveComputation(data),
  [data]
);
```

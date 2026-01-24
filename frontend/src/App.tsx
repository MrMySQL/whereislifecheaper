import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import posthog from './lib/posthog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';
import Home from './pages/Home';
import CountryProducts from './pages/CountryProducts';
import Login from './pages/Login';
import Mapping from './pages/admin/Mapping';
import Scrapers from './pages/admin/Scrapers';
import RequestCountry from './pages/RequestCountry';
import { loadExchangeRates } from './utils/currency';

// Track page views for SPA navigation
function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    posthog.capture('$pageview');
  }, [location.pathname]);

  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

function App() {
  // Load exchange rates from API on app initialization
  useEffect(() => {
    loadExchangeRates();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <PageViewTracker />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="country/:code" element={<CountryProducts />} />
              <Route path="request-country" element={<RequestCountry />} />
              <Route
                path="admin/mapping"
                element={
                  <ProtectedRoute requireAdmin>
                    <Mapping />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/scrapers"
                element={
                  <ProtectedRoute requireAdmin>
                    <Scrapers />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

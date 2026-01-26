import { useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from './Header';
import { MapPin, Heart } from 'lucide-react';

export default function Layout() {
  const { i18n } = useTranslation();

  // Update the HTML lang attribute when language changes (important for SEO)
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-terracotta-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
        Skip to main content
      </a>

      <Header />

      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6" role="main">
        <Outlet />
      </main>

      {/* Compact Footer */}
      <footer className="border-t border-cream-200 bg-white/60 mt-auto" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-terracotta-500 to-terracotta-600 flex items-center justify-center" aria-hidden="true">
                <MapPin className="h-3 w-3 text-white" />
              </div>
              <span className="font-display font-semibold text-charcoal-700">WhereIsLifeCheaper</span>
            </div>

            <nav className="flex items-center gap-4 text-charcoal-500" aria-label="Footer navigation">
              <span className="flex items-center gap-1">
                Made with <Heart className="w-3 h-3 text-terracotta-500 fill-terracotta-500" aria-label="love" /> for people like us
              </span>
              <span className="text-cream-400" aria-hidden="true">|</span>
              <Link to="/request-country" className="hover:text-terracotta-600 transition-colors">
                Request a Country
              </Link>
              <span className="text-cream-400" aria-hidden="true">|</span>
              <span>&copy; {new Date().getFullYear()} WhereIsLifeCheaper</span>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

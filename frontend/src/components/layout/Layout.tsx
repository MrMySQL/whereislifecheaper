import { Outlet, Link } from 'react-router-dom';
import Header from './Header';
import { MapPin, Heart } from 'lucide-react';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6">
        <Outlet />
      </main>

      {/* Compact Footer */}
      <footer className="border-t border-cream-200 bg-white/60 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-terracotta-500 to-terracotta-600 flex items-center justify-center">
                <MapPin className="h-3 w-3 text-white" />
              </div>
              <span className="font-display font-semibold text-charcoal-700">WhereIsLifeCheaper</span>
            </div>

            <div className="flex items-center gap-4 text-charcoal-500">
              <span className="flex items-center gap-1">
                Made with <Heart className="w-3 h-3 text-terracotta-500 fill-terracotta-500" /> for people like us
              </span>
              <span className="text-cream-400">|</span>
              <Link to="/request-country" className="hover:text-terracotta-600 transition-colors">
                Request a Country
              </Link>
              <span className="text-cream-400">|</span>
              <span>&copy; {new Date().getFullYear()}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

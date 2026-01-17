import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, MapPin, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Header() {
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive(path)
        ? 'text-terracotta-700 bg-terracotta-50'
        : 'text-charcoal-600 hover:text-charcoal-900 hover:bg-cream-100'
    }`;

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-cream-200/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-12">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-terracotta-500 to-terracotta-600 flex items-center justify-center shadow-sm transition-transform group-hover:scale-105">
              <MapPin className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="hidden sm:block text-sm font-display font-bold text-charcoal-900">
              WhereIsLife<span className="text-gradient-warm">Cheaper</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            <Link to="/" className={navLinkClass('/')}>
              Compare
            </Link>
            {isAdmin && (
              <>
                <Link to="/admin/mapping" className={navLinkClass('/admin/mapping')}>
                  Mapping
                </Link>
                <Link to="/admin/scrapers" className={navLinkClass('/admin/scrapers')}>
                  Scrapers
                </Link>
              </>
            )}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cream-50 border border-cream-200 text-xs">
                  {user?.picture_url ? (
                    <img src={user.picture_url} alt="" className="h-5 w-5 rounded" />
                  ) : (
                    <div className="h-5 w-5 rounded bg-saffron-400 flex items-center justify-center">
                      <User className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <span className="font-medium text-charcoal-700 max-w-[80px] truncate">
                    {user?.name || user?.email}
                  </span>
                  {isAdmin && <span className="badge-terracotta !text-[9px] !px-1 !py-0">Admin</span>}
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 text-charcoal-400 hover:text-terracotta-600 hover:bg-terracotta-50 rounded-lg transition-colors"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 text-charcoal-600 hover:bg-cream-100 rounded-lg"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-cream-200">
            <nav className="flex flex-col gap-1">
              <Link to="/" className={navLinkClass('/')} onClick={() => setMobileMenuOpen(false)}>
                Compare Prices
              </Link>
              {isAdmin && (
                <>
                  <Link to="/admin/mapping" className={navLinkClass('/admin/mapping')} onClick={() => setMobileMenuOpen(false)}>
                    Product Mapping
                  </Link>
                  <Link to="/admin/scrapers" className={navLinkClass('/admin/scrapers')} onClick={() => setMobileMenuOpen(false)}>
                    Scrapers
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

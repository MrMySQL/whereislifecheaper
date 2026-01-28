import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, Menu, X } from 'lucide-react';
import { useState } from 'react';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { AppLogo } from '../common/AppLogo';

export default function Header() {
  const { t } = useTranslation();
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
            <AppLogo size={28} className="transition-transform group-hover:scale-105" />
            <span className="hidden sm:block text-sm font-display font-bold text-charcoal-900">
              WhereIsLife<span className="text-gradient-warm">Cheaper</span>
            </span>
          </Link>

          {/* Desktop Navigation - only for authenticated users */}
          {isAuthenticated && (
            <nav className="hidden md:flex items-center gap-1" aria-label={t('nav.mainNavigation')}>
              <Link to="/" className={navLinkClass('/')}>
                {t('nav.compare')}
              </Link>
              {isAdmin && (
                <>
                  <Link to="/admin/mapping" className={navLinkClass('/admin/mapping')}>
                    {t('nav.mapping')}
                  </Link>
                  <Link to="/admin/scrapers" className={navLinkClass('/admin/scrapers')}>
                    {t('nav.scrapers')}
                  </Link>
                </>
              )}
            </nav>
          )}

          {/* User Menu */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
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
                  {isAdmin && <span className="badge-terracotta !text-[9px] !px-1 !py-0">{t('common.admin')}</span>}
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 text-charcoal-400 hover:text-terracotta-600 hover:bg-terracotta-50 rounded-lg transition-colors"
                  title={t('common.logout')}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
            {isAuthenticated && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-1.5 text-charcoal-600 hover:bg-cream-100 rounded-lg"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation"
                aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              >
                {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation - only for authenticated users */}
        {isAuthenticated && mobileMenuOpen && (
          <div id="mobile-navigation" className="md:hidden py-3 border-t border-cream-200" role="navigation" aria-label={t('nav.mobileNavigation')}>
            <nav className="flex flex-col gap-1">
              <Link to="/" className={navLinkClass('/')} onClick={() => setMobileMenuOpen(false)}>
                {t('nav.comparePrices')}
              </Link>
              {isAdmin && (
                <>
                  <Link to="/admin/mapping" className={navLinkClass('/admin/mapping')} onClick={() => setMobileMenuOpen(false)}>
                    {t('nav.productMapping')}
                  </Link>
                  <Link to="/admin/scrapers" className={navLinkClass('/admin/scrapers')} onClick={() => setMobileMenuOpen(false)}>
                    {t('nav.scrapers')}
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

import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, Settings, ShoppingCart } from 'lucide-react';

export default function Header() {
  const { user, isAdmin, isAuthenticated, login, logout } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <ShoppingCart className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-slate-900">
              WhereIsLifeCheaper
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className="text-slate-600 hover:text-slate-900 font-medium"
            >
              Compare Prices
            </Link>
            {isAdmin && (
              <>
                <Link
                  to="/admin/mapping"
                  className="text-slate-600 hover:text-slate-900 font-medium"
                >
                  Product Mapping
                </Link>
                <Link
                  to="/admin/scrapers"
                  className="text-slate-600 hover:text-slate-900 font-medium"
                >
                  Scrapers
                </Link>
              </>
            )}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user?.picture_url ? (
                  <img
                    src={user.picture_url}
                    alt={user.name || 'User'}
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                )}
                <span className="hidden sm:block text-sm font-medium text-slate-700">
                  {user?.name || user?.email}
                </span>
                {isAdmin && (
                  <span className="hidden sm:block px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                    Admin
                  </span>
                )}
                <button
                  onClick={logout}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                  title="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="btn-primary flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Admin Login
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

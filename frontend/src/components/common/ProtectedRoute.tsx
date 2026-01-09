import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Loading from './Loading';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { user, loading, isAdmin, isAuthenticated } = useAuth();

  if (loading) {
    return <Loading text="Checking authentication..." fullScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <div className="card">
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-600 mb-4">
            You need administrator privileges to access this page.
          </p>
          <p className="text-sm text-slate-500">
            Logged in as: {user?.email}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';

export default function ProtectedRoute() {
  const { user, loading, supabaseReady } = useAuth();

  if (!supabaseReady) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

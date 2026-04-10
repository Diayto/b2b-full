import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OwnerInsights from './pages/OwnerInsights';
import Uploads from './pages/Uploads';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import DeadlineReminderBootstrap from './components/DeadlineReminderBootstrap';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { AuthProvider } from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';

const queryClient = new QueryClient();

function AppRoutes() {
  const location = useLocation();

  return (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/insights" element={<OwnerInsights />} />
          <Route path="/uploads" element={<Uploads />} />
          <Route path="/settings" element={<Settings />} />

          {/* Legacy / internal routes → owner MVP surfaces */}
          <Route path="/marketing/*" element={<Navigate to="/uploads" replace />} />
          <Route path="/sales-cash" element={<Navigate to="/dashboard" replace />} />
          <Route path="/documents" element={<Navigate to="/uploads" replace />} />
          <Route path="/plan" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </RouteErrorBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <AuthProvider>
            <DeadlineReminderBootstrap />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

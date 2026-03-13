import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Uploads from './pages/Uploads';
import Documents from './pages/Documents';
import Settings from './pages/Settings';
import Plan from './pages/Plan';
import NotFound from './pages/NotFound';
import DeadlineReminderBootstrap from './components/DeadlineReminderBootstrap';

// Новые импорты для модуля Marketing
import MarketingLayout from './pages/marketing/MarketingLayout';
import MarketingDashboard from './pages/marketing/MarketingDashboard';
import MarketingReports from './pages/marketing/MarketingReports';
import MarketingData from './pages/marketing/MarketingData';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <DeadlineReminderBootstrap />
        <Routes>
          <Route path="/" element={<Login />} />

          {/* Авторизованные страницы (оборачиваются в AppLayout где-то выше или в ProtectedRoute) */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/uploads" element={<Uploads />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/settings" element={<Settings />} />

          {/* Новый модуль Marketing */}
          <Route path="/marketing" element={<MarketingLayout />}>
            <Route index element={<MarketingDashboard />} />
            <Route path="reports" element={<MarketingReports />} />
            <Route path="data" element={<MarketingData />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
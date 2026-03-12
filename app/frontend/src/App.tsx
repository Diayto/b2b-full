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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <DeadlineReminderBootstrap />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/uploads" element={<Uploads />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

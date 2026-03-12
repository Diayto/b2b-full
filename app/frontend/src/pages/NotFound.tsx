import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-200 mb-4">404</h1>
        <p className="text-lg font-medium text-slate-700 mb-2">Страница не найдена</p>
        <p className="text-sm text-slate-500 mb-6">Проверьте адрес или вернитесь на главную</p>
        <Link to="/">
          <Button className="bg-[#1E3A5F] hover:bg-[#1E3A5F]/90">
            <Home className="h-4 w-4 mr-2" />
            На главную
          </Button>
        </Link>
      </div>
    </div>
  );
}
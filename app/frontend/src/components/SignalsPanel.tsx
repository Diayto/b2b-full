// ============================================================
// BizPulse KZ — Signals Panel Component
// ============================================================

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import type { Signal, SignalSeverity } from '@/lib/types';

interface SignalsPanelProps {
  signals: Signal[];
  onClose: (signalId: string) => void;
}

const severityConfig: Record<SignalSeverity, {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  label: string;
}> = {
  high: {
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-l-red-500',
    icon: <AlertCircle className="h-4 w-4 text-red-500" />,
    label: 'Высокий',
  },
  medium: {
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-l-amber-500',
    icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    label: 'Средний',
  },
  low: {
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-l-blue-500',
    icon: <Info className="h-4 w-4 text-blue-500" />,
    label: 'Низкий',
  },
};

export default function SignalsPanel({ signals, onClose }: SignalsPanelProps) {
  const [filter, setFilter] = useState<SignalSeverity | 'all'>('all');

  const openSignals = signals.filter(s => s.status === 'open');
  const filtered = filter === 'all'
    ? openSignals
    : openSignals.filter(s => s.severity === filter);

  const countBySeverity = {
    high: openSignals.filter(s => s.severity === 'high').length,
    medium: openSignals.filter(s => s.severity === 'medium').length,
    low: openSignals.filter(s => s.severity === 'low').length,
  };

  if (openSignals.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">🔔 Сигналы</h3>
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-3" />
          <p className="text-sm font-medium text-slate-600">Всё в порядке!</p>
          <p className="text-xs text-slate-400 mt-1">Нет активных сигналов</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-900">🔔 Сигналы дня</h3>
          <Badge variant="secondary" className="bg-red-100 text-red-700">
            {openSignals.length}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            className={cn(filter === 'all' && 'bg-[#1E3A5F] hover:bg-[#1E3A5F]/90')}
          >
            Все ({openSignals.length})
          </Button>
          {(['high', 'medium', 'low'] as const).map(sev => (
            countBySeverity[sev] > 0 && (
              <Button
                key={sev}
                size="sm"
                variant={filter === sev ? 'default' : 'outline'}
                onClick={() => setFilter(sev)}
                className={cn(
                  filter === sev && sev === 'high' && 'bg-red-600 hover:bg-red-700',
                  filter === sev && sev === 'medium' && 'bg-amber-600 hover:bg-amber-700',
                  filter === sev && sev === 'low' && 'bg-blue-600 hover:bg-blue-700',
                )}
              >
                {severityConfig[sev].label} ({countBySeverity[sev]})
              </Button>
            )
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
        {filtered.map(signal => {
          const config = severityConfig[signal.severity];
          return (
            <div
              key={signal.id}
              className={cn(
                'p-4 border-l-4 hover:bg-slate-50/50 transition-colors',
                config.borderColor
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {config.icon}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{signal.title}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{signal.description}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(signal.createdAt).toLocaleDateString('ru-KZ')}
                    </p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 h-7 w-7 text-slate-400 hover:text-slate-600"
                  onClick={() => onClose(signal.id)}
                  title="Закрыть сигнал"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// Chrona — Data: table upload + Instagram → Supabase → dashboard
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { MvpSupabaseUploadCard } from '@/components/MvpSupabaseUploadCard';
import SessionDemoGuide from '@/components/SessionDemoGuide';
import OwnerDemoScenarioCard from '@/components/OwnerDemoScenarioCard';
import InstagramConnectCard from '@/components/InstagramConnectCard';
import { getSession } from '@/lib/store';
import { formatIgOAuthReason } from '@/lib/instagram-oauth-messages';
import { persistInstagramPipelineMetrics } from '@/lib/ingestBackendSummaries';
import { toast } from 'sonner';

export default function UploadsPage() {
  const companyId = getSession()?.companyId ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const [oauthFeedback, setOauthFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [igRefreshKey, setIgRefreshKey] = useState(0);

  useEffect(() => {
    const ig = searchParams.get('ig_oauth');
    if (ig === null) return;
    const reason = searchParams.get('reason');
    if (ig === '1') {
      setOauthFeedback({ type: 'success', message: 'Instagram подключён' });
      toast.success('Instagram подключён');
      if (companyId) {
        void persistInstagramPipelineMetrics(companyId).finally(() => setIgRefreshKey((k) => k + 1));
      }
    } else {
      const msg = formatIgOAuthReason(reason);
      setOauthFeedback({ type: 'error', message: msg });
      toast.error(msg);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('ig_oauth');
    next.delete('reason');
    next.delete('sourceId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, companyId]);

  return (
    <AppLayout>
      <div className="chrona-page max-w-2xl space-y-6">
        <div className="chrona-tier-1">
          <h1 className="rct-page-title">Данные</h1>
          <p className="rct-body-micro mt-1 text-muted-foreground">
            Подключите источники и загрузите сводную таблицу — главный экран и разбор строятся из одного снимка в облаке.
          </p>
        </div>

        <InstagramConnectCard
          key={igRefreshKey}
          companyId={companyId}
          oauthFeedback={oauthFeedback}
          onSynced={() => {
            if (companyId) {
              void persistInstagramPipelineMetrics(companyId).then(() => {
                toast.success('Метрики Instagram сохранены — откройте главный экран');
              });
            }
          }}
        />

        <OwnerDemoScenarioCard companyId={companyId} />

        <SessionDemoGuide />

        <MvpSupabaseUploadCard companyId={companyId} />
      </div>
    </AppLayout>
  );
}

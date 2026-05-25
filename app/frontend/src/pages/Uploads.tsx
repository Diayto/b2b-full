// Chrona — Data: table upload → Supabase → dashboard
import AppLayout from '@/components/AppLayout';
import { MvpSupabaseUploadCard } from '@/components/MvpSupabaseUploadCard';
import SessionDemoGuide from '@/components/SessionDemoGuide';
import OwnerDemoScenarioCard from '@/components/OwnerDemoScenarioCard';
import { getSession } from '@/lib/store';

export default function UploadsPage() {
  const companyId = getSession()?.companyId ?? '';

  return (
    <AppLayout>
      <div className="chrona-page max-w-2xl space-y-6">
        <div className="chrona-tier-1">
          <h1 className="rct-page-title">Данные</h1>
          <p className="rct-body-micro mt-1 text-muted-foreground">
            Загрузите сводную таблицу — главный экран и разбор построятся из одного снимка периода в облаке.
          </p>
        </div>

        <OwnerDemoScenarioCard companyId={companyId} />

        <SessionDemoGuide />

        <MvpSupabaseUploadCard companyId={companyId} />
      </div>
    </AppLayout>
  );
}

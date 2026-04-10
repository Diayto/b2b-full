  -- One insight row per company + period (Task 3 upsert)
  create unique index if not exists ux_insights_company_period
    on public.insights (company_id, period_start, period_end);

// ============================================================
// BizPulse — Organic / Content Performance Analytics
//
// Reusable service for content analytics.
// Consumed by Marketing page, not embedded in page components.
// ============================================================

import type { ContentMetric, ContentPlatform } from './domain';
import { PLATFORM_LABELS } from './domain';

export interface ContentPerformanceSummary {
  totalContent: number;
  totalImpressions: number;
  totalReach: number;
  totalEngagement: number;
  totalLeads: number;
  totalPaidConversions: number;
  avgEngagementRate: number;          // (likes+comments+saves+shares) / reach
  avgConversionToLead: number;        // leadsGenerated / reach
  topPerforming: ContentMetricRanked[];
  worstPerforming: ContentMetricRanked[];
  byPlatform: PlatformSummary[];
}

export interface ContentMetricRanked {
  contentId: string;
  contentTitle: string;
  platform: ContentPlatform;
  publishedAt: string;
  engagementRate: number;
  conversionToLead: number;
  impressions: number;
  leadsGenerated: number;
}

export interface PlatformSummary {
  platform: ContentPlatform;
  label: string;
  contentCount: number;
  totalImpressions: number;
  totalReach: number;
  totalEngagement: number;
  totalLeads: number;
  avgEngagementRate: number;
  avgConversionToLead: number;
}

/**
 * Compute content performance analytics from raw content metrics.
 */
export function computeContentPerformance(
  metrics: ContentMetric[],
  topN: number = 5,
): ContentPerformanceSummary {
  if (metrics.length === 0) {
    return {
      totalContent: 0,
      totalImpressions: 0,
      totalReach: 0,
      totalEngagement: 0,
      totalLeads: 0,
      totalPaidConversions: 0,
      avgEngagementRate: 0,
      avgConversionToLead: 0,
      topPerforming: [],
      worstPerforming: [],
      byPlatform: [],
    };
  }

  let totalImpressions = 0;
  let totalReach = 0;
  let totalEngagement = 0;
  let totalLeads = 0;
  let totalPaidConversions = 0;

  const ranked: ContentMetricRanked[] = [];

  for (const m of metrics) {
    const engagement = m.likes + m.comments + m.saves + m.shares;
    const engagementRate = m.reach > 0 ? engagement / m.reach : 0;
    const conversionToLead = m.reach > 0 ? m.leadsGenerated / m.reach : 0;

    totalImpressions += m.impressions;
    totalReach += m.reach;
    totalEngagement += engagement;
    totalLeads += m.leadsGenerated;
    totalPaidConversions += m.paidConversions;

    ranked.push({
      contentId: m.contentId,
      contentTitle: m.contentTitle ?? m.contentId,
      platform: m.platform,
      publishedAt: m.publishedAt,
      engagementRate,
      conversionToLead,
      impressions: m.impressions,
      leadsGenerated: m.leadsGenerated,
    });
  }

  const avgEngagementRate = totalReach > 0 ? totalEngagement / totalReach : 0;
  const avgConversionToLead = totalReach > 0 ? totalLeads / totalReach : 0;

  // Sort by engagement rate for top/worst
  const byEngagement = [...ranked].sort((a, b) => b.engagementRate - a.engagementRate);
  const topPerforming = byEngagement.slice(0, topN);
  const worstPerforming = byEngagement.slice(-topN).reverse();

  // By platform
  const platformMap = new Map<ContentPlatform, {
    count: number;
    impressions: number;
    reach: number;
    engagement: number;
    leads: number;
  }>();

  for (const m of metrics) {
    const prev = platformMap.get(m.platform) ?? { count: 0, impressions: 0, reach: 0, engagement: 0, leads: 0 };
    const engagement = m.likes + m.comments + m.saves + m.shares;
    platformMap.set(m.platform, {
      count: prev.count + 1,
      impressions: prev.impressions + m.impressions,
      reach: prev.reach + m.reach,
      engagement: prev.engagement + engagement,
      leads: prev.leads + m.leadsGenerated,
    });
  }

  const byPlatform: PlatformSummary[] = Array.from(platformMap.entries())
    .map(([platform, data]) => ({
      platform,
      label: PLATFORM_LABELS[platform],
      contentCount: data.count,
      totalImpressions: data.impressions,
      totalReach: data.reach,
      totalEngagement: data.engagement,
      totalLeads: data.leads,
      avgEngagementRate: data.reach > 0 ? data.engagement / data.reach : 0,
      avgConversionToLead: data.reach > 0 ? data.leads / data.reach : 0,
    }))
    .sort((a, b) => b.totalLeads - a.totalLeads);

  return {
    totalContent: metrics.length,
    totalImpressions,
    totalReach,
    totalEngagement,
    totalLeads,
    totalPaidConversions,
    avgEngagementRate,
    avgConversionToLead,
    topPerforming,
    worstPerforming,
    byPlatform,
  };
}

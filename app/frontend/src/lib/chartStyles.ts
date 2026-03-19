/**
 * Shared chart styling for Revenue Control Tower.
 * Supports light and dark themes via getChartTheme / useChartTheme.
 *
 * Palette: cobalt/teal/rose — no orange accents, no harsh greens.
 */

import { useTheme } from 'next-themes';
import { useMemo } from 'react';

/* ── Theme-specific palettes ── */

export interface ChartTheme {
  gridStroke: string;
  tickFill: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipShadow: string;
  trackBg: string;
}

const lightTheme: ChartTheme = {
  gridStroke: '#e4e8ee',
  tickFill: '#7a8494',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e4e8ee',
  tooltipText: '#1a1f2e',
  tooltipShadow: '0 4px 16px rgba(0,0,0,0.10)',
  trackBg: '#f0f2f5',
};

const darkTheme: ChartTheme = {
  gridStroke: 'rgba(255,255,255,0.06)',
  tickFill: '#787f8e',
  tooltipBg: '#1a1c22',
  tooltipBorder: '#2a2d35',
  tooltipText: '#e4e6ea',
  tooltipShadow: '0 4px 16px rgba(0,0,0,0.45)',
  trackBg: '#111317',
};

export function getChartTheme(isDark: boolean): ChartTheme {
  return isDark ? darkTheme : lightTheme;
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  return useMemo(() => getChartTheme(resolvedTheme === 'dark'), [resolvedTheme]);
}

/* ── Backward-compatible light-mode defaults ── */

export const CHART_GRID_STROKE = lightTheme.gridStroke;
export const CHART_TICK_FONT = 11;
export const CHART_MARGIN = { top: 14, right: 14, bottom: 14, left: 6 };

export const truncateLabel = (s: string, maxLen = 20): string =>
  String(s).length <= maxLen ? String(s) : `${String(s).slice(0, maxLen - 1)}…`;

export const CHART_AXIS_TICK = {
  fontSize: 11,
  fill: lightTheme.tickFill,
} as const;

export const CHART_TOOLTIP = {
  contentStyle: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: `1px solid ${lightTheme.tooltipBorder}`,
    backgroundColor: lightTheme.tooltipBg,
    boxShadow: lightTheme.tooltipShadow,
  },
  wrapperStyle: { outline: 'none' },
} as const;

export const CHART_LEGEND = {
  wrapperStyle: { fontSize: 11, color: lightTheme.tickFill, paddingTop: 8 },
  iconSize: 10,
} as const;

export function buildAxisTick(theme: ChartTheme) {
  return { fontSize: 11, fill: theme.tickFill } as const;
}

export function buildTooltipStyle(theme: ChartTheme) {
  return {
    contentStyle: {
      padding: '10px 14px',
      borderRadius: '10px',
      border: `1px solid ${theme.tooltipBorder}`,
      backgroundColor: theme.tooltipBg,
      color: theme.tooltipText,
      boxShadow: theme.tooltipShadow,
      fontSize: '12px',
      lineHeight: '1.5',
    },
    wrapperStyle: { outline: 'none' },
  } as const;
}

export function buildLegendStyle(theme: ChartTheme) {
  return {
    wrapperStyle: { fontSize: 11, color: theme.tickFill, paddingTop: 8 },
    iconSize: 10,
  } as const;
}

/** Premium semantic palette — cobalt / teal / rose / neutral */
export const CHART_COLORS = {
  paid: '#5872A8',
  expected: '#8E9ABF',
  overdue: '#B86B7A',
  leads: '#7B8699',
  deals: '#6478A8',
  won: '#5A9E94',
  spend: '#8E95A0',
  amber: '#A89768',
  rose: '#B86B7A',
} as const;

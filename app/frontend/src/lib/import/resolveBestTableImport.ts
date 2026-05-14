// ============================================================
// Pick best file type + column mapping by maximizing parsed rows
// (any table → closest known schema).
// ============================================================

import type { FileType } from '../types';
import type { ParseResult } from '../parsers';
import { parseFromRows } from '../parsers';
import type { DetectionResult } from './pipeline';
import { applyColumnMappings } from './pipeline';
import { detectAndMap, mapWithPreset } from './detector';
import { smartMapColumns } from '../columnMapper';
import { enrichLeadsWithDefaultChannel } from './smartWorkbookDefaults';

export const ALL_IMPORT_FILE_TYPES: FileType[] = [
  'transactions',
  'customers',
  'invoices',
  'marketing_spend',
  'leads',
  'deals',
  'payments',
  'channels_campaigns',
  'managers',
  'content_metrics',
];

/** Same hints as Uploads — sheet tab name nudges type when scores tie. */
export function suggestFileTypeBySheetName(sheetName: string): FileType | null {
  const normalized = sheetName.toLowerCase().trim();
  if (normalized.includes('консультац')) return 'leads';
  if (normalized.includes('продаж')) return 'deals';
  if (normalized.includes('свод')) return 'marketing_spend';
  if (normalized.includes('расход') || normalized.includes('spend')) return 'marketing_spend';
  return null;
}

function parseWithLeadsEnrich(fileType: FileType, mappedRows: Record<string, unknown>[]): ParseResult {
  const raw = parseFromRows(mappedRows, fileType);
  return fileType === 'leads' ? enrichLeadsWithDefaultChannel(raw) : raw;
}

function scoreParsed(
  preferred: FileType | null,
  fileType: FileType,
  parsed: ParseResult,
  mappingCount: number,
): number {
  const rowScore = parsed.rows.length * 1_000_000 - parsed.errors.length * 1_000 + mappingCount;
  const preferredBonus = preferred && fileType === preferred ? 500_000 : 0;
  return rowScore + preferredBonus;
}

export interface ResolvedBestTableImport {
  fileType: FileType;
  detection: DetectionResult;
  mappedRows: Record<string, unknown>[];
  parsed: ParseResult;
}

/**
 * Tries every known import schema + detector + legacy smart mapper;
 * returns the candidate with the most successfully parsed rows (fewer errors, more mappings as tie-break).
 */
export function resolveBestTableImport(
  rows: Record<string, unknown>[],
  options?: { sheetName?: string },
): ResolvedBestTableImport | null {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  if (!cols.length) return null;

  const preferred = options?.sheetName ? suggestFileTypeBySheetName(options.sheetName) : null;
  const byType = new Map<FileType, ResolvedBestTableImport>();

  const consider = (fileType: FileType, detection: DetectionResult, mappedRows: Record<string, unknown>[]) => {
    if (detection.mappings.length === 0) return;
    const parsed = parseWithLeadsEnrich(fileType, mappedRows);
    const s = scoreParsed(preferred, fileType, parsed, detection.mappings.length);
    const existing = byType.get(fileType);
    if (!existing) {
      byType.set(fileType, { fileType, detection: { ...detection, fileType }, mappedRows, parsed });
      return;
    }
    const prev = scoreParsed(preferred, fileType, existing.parsed, existing.detection.mappings.length);
    if (s > prev) {
      byType.set(fileType, { fileType, detection: { ...detection, fileType }, mappedRows, parsed });
    }
  };

  for (const ft of ALL_IMPORT_FILE_TYPES) {
    const det = mapWithPreset(cols, ft);
    if (det.mappings.length === 0) continue;
    const mapped = applyColumnMappings(rows, det.mappings);
    consider(ft, det, mapped);
  }

  const dm = detectAndMap(cols);
  if (dm.mappings.length > 0) {
    const mapped = applyColumnMappings(rows, dm.mappings);
    consider(dm.fileType, dm, mapped);
  }

  const sm = smartMapColumns(cols);
  if (sm.mappings.length > 0) {
    const detection: DetectionResult = {
      fileType: sm.detectedType,
      confidence: sm.typeConfidence / 100,
      mappings: sm.mappings.map((m) => ({
        sourceColumn: m.sourceColumn,
        targetField: m.targetField,
        confidence: m.confidence / 100,
        isUserOverride: false,
      })),
      unmappedSourceColumns: sm.unmappedSourceColumns,
      unmappedTargetFields: sm.unmappedTargetFields,
    };
    const mapped = applyColumnMappings(rows, detection.mappings);
    consider(sm.detectedType, detection, mapped);
  }

  let best: ResolvedBestTableImport | null = null;
  let bestScore = -Infinity;
  for (const cand of byType.values()) {
    const s = scoreParsed(preferred, cand.fileType, cand.parsed, cand.detection.mappings.length);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }

  if (!best || best.parsed.rows.length === 0) return null;
  return best;
}

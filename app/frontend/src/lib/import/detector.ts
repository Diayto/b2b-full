// ============================================================
// BizPulse — File Type Detection & Column Mapping
//
// Enhanced version of columnMapper.ts that uses import presets
// for higher confidence scoring. Supports RU + EN aliases.
// ============================================================

import type { FileType } from '../types';
import type { ColumnMapping, DetectionResult } from './pipeline';
import { IMPORT_PRESETS, getPresetRequiredFields } from './presets';
import type { ImportPreset } from './presets';

/**
 * Normalize a column name for fuzzy matching.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]/gi, '')
    .replace(/\s+/g, '');
}

/**
 * Score how well a source column matches a candidate alias.
 * Returns 0..1.
 */
function matchScore(sourceNorm: string, candidateNorm: string): number {
  if (sourceNorm === candidateNorm) return 1.0;
  if (sourceNorm.includes(candidateNorm) || candidateNorm.includes(sourceNorm)) return 0.8;

  // Levenshtein distance for fuzzy matching
  const maxLen = Math.max(sourceNorm.length, candidateNorm.length);
  if (maxLen === 0) return 0;
  const dist = levenshteinDistance(sourceNorm, candidateNorm);
  const similarity = 1 - dist / maxLen;
  return similarity > 0.7 ? similarity * 0.6 : 0;
}

/**
 * Detect file type and map columns using preset knowledge.
 */
export function detectAndMap(sourceColumns: string[]): DetectionResult {
  const sourceNorms = sourceColumns.map(normalize);
  const results: Array<{ preset: ImportPreset; score: number; mappings: ColumnMapping[] }> = [];

  for (const preset of IMPORT_PRESETS) {
    const mappings: ColumnMapping[] = [];
    const usedTargets = new Set<string>();
    let totalScore = 0;

    for (let si = 0; si < sourceColumns.length; si++) {
      const sourceCol = sourceColumns[si];
      const sourceNorm = sourceNorms[si];
      let bestField = '';
      let bestScore = 0;

      for (const field of preset.fields) {
        if (usedTargets.has(field.field)) continue;

        // Match against field name itself
        let fScore = matchScore(sourceNorm, normalize(field.field));
        fScore = Math.max(fScore, matchScore(sourceNorm, normalize(field.label)));

        // Match against all aliases
        for (const alias of field.aliases) {
          fScore = Math.max(fScore, matchScore(sourceNorm, normalize(alias)));
        }

        if (fScore > bestScore) {
          bestScore = fScore;
          bestField = field.field;
        }
      }

      if (bestScore >= 0.5 && bestField) {
        mappings.push({
          sourceColumn: sourceCol,
          targetField: bestField,
          confidence: bestScore,
          isUserOverride: false,
        });
        usedTargets.add(bestField);
        totalScore += bestScore;
      }
    }

    // Bonus for matching required fields
    const requiredFields = getPresetRequiredFields(preset);
    const matchedRequired = requiredFields.filter((f) => usedTargets.has(f)).length;
    const requiredBonus = requiredFields.length > 0
      ? (matchedRequired / requiredFields.length) * 2
      : 0;

    const normalizedScore = sourceColumns.length > 0
      ? (totalScore + requiredBonus) / (sourceColumns.length + requiredFields.length)
      : 0;

    results.push({ preset, score: normalizedScore, mappings });
  }

  // Pick best result
  results.sort((a, b) => b.score - a.score);
  const best = results[0];

  if (!best || best.score < 0.1) {
    return {
      fileType: 'transactions',
      confidence: 0,
      mappings: [],
      unmappedSourceColumns: sourceColumns,
      unmappedTargetFields: [],
    };
  }

  const mappedSources = new Set(best.mappings.map((m) => m.sourceColumn));
  const mappedTargets = new Set(best.mappings.map((m) => m.targetField));
  const allTargetFields = best.preset.fields.map((f) => f.field);

  return {
    fileType: best.preset.fileType,
    confidence: Math.min(1, best.score),
    mappings: best.mappings,
    unmappedSourceColumns: sourceColumns.filter((c) => !mappedSources.has(c)),
    unmappedTargetFields: allTargetFields.filter((f) => !mappedTargets.has(f)),
  };
}

/**
 * Re-map with a specific preset (when user selects file type manually).
 */
export function mapWithPreset(
  sourceColumns: string[],
  fileType: FileType,
): DetectionResult {
  const preset = IMPORT_PRESETS.find((p) => p.fileType === fileType);
  if (!preset) {
    return {
      fileType,
      confidence: 0,
      mappings: [],
      unmappedSourceColumns: sourceColumns,
      unmappedTargetFields: [],
    };
  }

  const sourceNorms = sourceColumns.map(normalize);
  const mappings: ColumnMapping[] = [];
  const usedTargets = new Set<string>();

  for (let si = 0; si < sourceColumns.length; si++) {
    const sourceCol = sourceColumns[si];
    const sourceNorm = sourceNorms[si];
    let bestField = '';
    let bestScore = 0;

    for (const field of preset.fields) {
      if (usedTargets.has(field.field)) continue;

      let fScore = matchScore(sourceNorm, normalize(field.field));
      fScore = Math.max(fScore, matchScore(sourceNorm, normalize(field.label)));

      for (const alias of field.aliases) {
        fScore = Math.max(fScore, matchScore(sourceNorm, normalize(alias)));
      }

      if (fScore > bestScore) {
        bestScore = fScore;
        bestField = field.field;
      }
    }

    if (bestScore >= 0.4 && bestField) {
      mappings.push({
        sourceColumn: sourceCol,
        targetField: bestField,
        confidence: bestScore,
        isUserOverride: false,
      });
      usedTargets.add(bestField);
    }
  }

  const mappedSources = new Set(mappings.map((m) => m.sourceColumn));
  const mappedTargets = new Set(mappings.map((m) => m.targetField));
  const allTargetFields = preset.fields.map((f) => f.field);

  const requiredFields = getPresetRequiredFields(preset);
  const matchedRequired = requiredFields.filter((f) => mappedTargets.has(f)).length;
  const confidence = requiredFields.length > 0
    ? matchedRequired / requiredFields.length
    : mappings.length > 0 ? 0.5 : 0;

  return {
    fileType,
    confidence: Math.min(1, confidence),
    mappings,
    unmappedSourceColumns: sourceColumns.filter((c) => !mappedSources.has(c)),
    unmappedTargetFields: allTargetFields.filter((f) => !mappedTargets.has(f)),
  };
}

/**
 * Get all target fields for a given file type (from preset).
 */
export function getTargetFieldsForType(fileType: FileType): string[] {
  const preset = IMPORT_PRESETS.find((p) => p.fileType === fileType);
  return preset ? preset.fields.map((f) => f.field) : [];
}

// Simple Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const dp: number[][] = [];
  for (let i = 0; i <= la; i++) {
    dp[i] = [i];
  }
  for (let j = 1; j <= lb; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[la][lb];
}

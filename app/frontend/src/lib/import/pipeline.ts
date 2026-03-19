// ============================================================
// BizPulse — Import Pipeline Architecture
//
// Multi-stage ingestion pipeline:
//   1. Raw file intake
//   2. File type detection
//   3. Column mapping
//   4. Validation
//   5. Transformation into normalized schema
//   6. Preview
//   7. Save / import
//
// All import logic extracted from Uploads.tsx into
// reusable, testable modules.
// ============================================================

import type { FileType } from '../types';

/** Individual column mapping with confidence */
export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;          // 0..1
  isUserOverride: boolean;
}

/** Result of file type detection + column mapping */
export interface DetectionResult {
  fileType: FileType;
  confidence: number;          // 0..1
  mappings: ColumnMapping[];
  unmappedSourceColumns: string[];
  unmappedTargetFields: string[];
}

/** Validation error/warning from stage 4 */
export interface ValidationMessage {
  severity: 'error' | 'warning';
  row?: number;
  column?: string;
  message: string;
}

/** Complete import pipeline state */
export type PipelineStage =
  | 'idle'
  | 'file_loaded'
  | 'type_detected'
  | 'columns_mapped'
  | 'validated'
  | 'previewing'
  | 'importing'
  | 'done'
  | 'error';

export interface PipelineState {
  stage: PipelineStage;
  fileName?: string;
  rawRows?: Record<string, unknown>[];
  sourceColumns?: string[];
  detection?: DetectionResult;
  validationMessages?: ValidationMessage[];
  previewRows?: Record<string, unknown>[];
  importResult?: ImportResult;
  error?: string;
}

export interface ImportResult {
  fileType: FileType;
  totalRows: number;
  successRows: number;
  errorRows: number;
  warningRows: number;
  errors: string[];
  warnings: string[];
}

/** Normalized row after mapping + transformation */
export type NormalizedRow = Record<string, unknown>;

/**
 * Apply column mappings to raw rows.
 * Returns rows with canonical field names.
 */
export function applyColumnMappings(
  rawRows: Record<string, unknown>[],
  mappings: ColumnMapping[],
): NormalizedRow[] {
  const mappingMap = new Map<string, string>();
  for (const m of mappings) {
    if (m.targetField) {
      mappingMap.set(m.sourceColumn, m.targetField);
    }
  }

  return rawRows.map((row) => {
    const out: NormalizedRow = {};
    for (const [key, value] of Object.entries(row)) {
      const targetField = mappingMap.get(key);
      if (targetField) {
        out[targetField] = value;
      }
    }
    return out;
  });
}

/**
 * Validate mapped rows against expected schema for the file type.
 */
export function validateMappedRows(
  rows: NormalizedRow[],
  fileType: FileType,
  requiredFields: string[],
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const field of requiredFields) {
      const value = row[field];
      if (value === undefined || value === null || value === '') {
        messages.push({
          severity: 'warning',
          row: i + 1,
          column: field,
          message: `Пустое значение в обязательном поле "${field}"`,
        });
      }
    }
  }

  if (rows.length === 0) {
    messages.push({
      severity: 'error',
      message: 'Файл не содержит данных',
    });
  }

  return messages;
}

/**
 * Create initial pipeline state.
 */
export function createPipelineState(): PipelineState {
  return { stage: 'idle' };
}

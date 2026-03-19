// ============================================================
// BizPulse Import Pipeline — Module Barrel
// ============================================================

// --- Pipeline ---
export type {
  ColumnMapping,
  DetectionResult,
  ValidationMessage,
  PipelineStage,
  PipelineState,
  ImportResult,
  NormalizedRow,
} from './pipeline';

export {
  applyColumnMappings,
  validateMappedRows,
  createPipelineState,
} from './pipeline';

// --- Presets ---
export type { PresetField, ImportPreset } from './presets';

export {
  IMPORT_PRESETS,
  getPresetByFileType,
  getPresetAliases,
  getPresetRequiredFields,
} from './presets';

// --- Detection & Mapping ---
export {
  detectAndMap,
  mapWithPreset,
  getTargetFieldsForType,
} from './detector';

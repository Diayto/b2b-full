// ============================================================
// Chrona — External ID normalization utilities
// Keeps import linkage stable across messy spreadsheet formats.
// ============================================================

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeReferenceId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = compactWhitespace(String(value));
  if (!text) return undefined;
  return text.toLowerCase();
}

function normalizePhoneLike(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length < 10) return null;

  let normalized = digits;
  if (digits.length === 10) normalized = `7${digits}`;
  else if (digits.length === 11 && digits.startsWith('8')) normalized = `7${digits.slice(1)}`;
  else if (digits.length > 11) {
    const tail10 = digits.slice(-10);
    normalized = `7${tail10}`;
  }

  if (normalized.length !== 11) return null;
  return normalized;
}

export function normalizeCustomerExternalId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = compactWhitespace(String(value));
  if (!text) return undefined;

  const phone = normalizePhoneLike(text);
  if (phone) return `phone:${phone}`;

  return text.toLowerCase();
}

/**
 * Lead IDs must match deal.leadExternalId. When spreadsheets use a phone as the lead key,
 * use the same `phone:7…` form as customers so deals can link via телефон ↔ лид.
 */
export function normalizeLeadExternalId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = compactWhitespace(String(value));
  if (!text) return undefined;

  const phone = normalizePhoneLike(text);
  if (phone) return `phone:${phone}`;

  return normalizeReferenceId(value);
}


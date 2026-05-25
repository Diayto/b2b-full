// Re-export session helpers (legacy import path `@/lib/store`).
import { clearLegacyBrowserStorage as clearLegacy } from './session';

export {
  syncAuthFromSupabaseUser,
  getSession,
  clearSession,
  getCurrentUser,
  getCompany,
  clearLegacyBrowserStorage,
  type Session,
} from './session';

/** @deprecated Use clearLegacyBrowserStorage */
export function clearCompanyLocalStorageData(_companyId: string): void {
  clearLegacy();
}

// Passcode de ops en el browser (llamadas RPC admin_*).
// localStorage para compartir sesión entre pestañas (ej. vista cliente en target="_blank").

const PASSCODE_KEY = 'meli_ops_passcode';

/** Migra passcode legacy de sessionStorage a localStorage (una sola vez). */
function migratePasscodeFromSessionStorage(): void {
  const legacy = sessionStorage.getItem(PASSCODE_KEY);
  if (legacy) {
    localStorage.setItem(PASSCODE_KEY, legacy);
    sessionStorage.removeItem(PASSCODE_KEY);
  }
}

export function getOpsPasscode(): string | null {
  if (typeof window === 'undefined') return null;
  migratePasscodeFromSessionStorage();
  return localStorage.getItem(PASSCODE_KEY);
}

export function setOpsPasscode(passcode: string): void {
  localStorage.setItem(PASSCODE_KEY, passcode);
  sessionStorage.removeItem(PASSCODE_KEY);
}

export function clearOpsPasscode(): void {
  localStorage.removeItem(PASSCODE_KEY);
  sessionStorage.removeItem(PASSCODE_KEY);
}

export function requireOpsPasscode(): string {
  const passcode = getOpsPasscode();
  if (!passcode) {
    throw new Error('Sesión expirada. Volvé a ingresar el passcode.');
  }
  return passcode;
}
